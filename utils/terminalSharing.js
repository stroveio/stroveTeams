const vscode = require("vscode");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const { handleError } = require("./errorHandling");
const { execute } = require("apollo-link");
const { websocketLink } = require("./websocketLink");
const { watchActiveUsersSubscription } = require("./queries");

let wasWebviewActivated = false;
let sharedTerminal;
let checkOutputFilesInterval;
let watchActiveUsersSubscriber = null;

let ACTIVE_USERS_DATA = {};

const userType = process.env.CODEALLY_USER_TYPE;
const myId = process.env.CODEALLY_USER_ID || "123";
// Copied from documentation, I don't know how to do it without a class
class TreeItem extends vscode.TreeItem {
  constructor(label, children) {
    super(
      label,
      children === undefined
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Expanded
    );
    this.children = children;
  }
}

// Copied from documentation and rewrote as function
const ActiveUsersTreeDataProvider = (fieldNames) => {
  const _onDidChangeTreeData = new vscode.EventEmitter();

  const onDidChangeTreeData = _onDidChangeTreeData.event;

  let data = [...fieldNames.map((fieldName) => new TreeItem(fieldName))];

  return {
    onDidChangeTreeData,

    data,

    getTreeItem: (element) => {
      return element;
    },

    getChildren: (element) => {
      if (element === undefined) {
        return data;
      }
      return element.children;
    },

    updateData: (fieldNames) =>
      (data = [...fieldNames.map((fieldName) => new TreeItem(fieldName))]),

    refresh: () => {
      _onDidChangeTreeData.fire(undefined);
    },
  };
};

const SharingManagementWebview = (_extensionUri) => {
  let _view;

  const resolveWebviewView = (webviewView, context, _token) => {
    _view = webviewView;

    webviewView.webview.options = {
      // Allow scripts in the webview
      enableScripts: true,
      localResourceRoots: [_extensionUri],
    };

    webviewView.webview.html = _getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((data) => {
      const { instruction, additionalData } = data;

      console.log(
        "🚀 ~ file: terminalSharing.js ~ line 104 ~ webviewView.webview.onDidReceiveMessage ~ data",
        data
      );

      switch (instruction) {
        case "initialized": {
          if (!wasWebviewActivated) {
            wasWebviewActivated = true;
            _view.webview.postMessage({ message: "reset-state" });

            if (userType === "guest") {
              _view.webview.postMessage({ message: "set-sharing-flag-true" });
              startSharing();
            } else if (userType === "hiring") {
              const guest = findGuest();

              if (guest) startReceiving({ userId: guest.id });
            }
          }
          break;
        }
        case "start-receiving": {
          startReceiving(additionalData);
          break;
        }
        case "start-sharing": {
          startSharing();
          break;
        }
        case "restart-sharing": {
          restartSharing();
          break;
        }
      }
    });
  };

  const sendData = ({ message, additionalData }) => {
    if (_view) {
      _view.webview.postMessage({ message, additionalData });
    }
  };

  const _getHtmlForWebview = (webview) => {
    try {
      // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
      const scriptUri = webview.asWebviewUri(
        vscode.Uri.joinPath(_extensionUri, "media", "sharing.js")
      );

      // Do the same for the stylesheet.
      const styleResetUri = webview.asWebviewUri(
        vscode.Uri.joinPath(_extensionUri, "media", "reset.css")
      );
      const styleVSCodeUri = webview.asWebviewUri(
        vscode.Uri.joinPath(_extensionUri, "media", "vscode.css")
      );
      const styleMainUri = webview.asWebviewUri(
        vscode.Uri.joinPath(_extensionUri, "media", "sharing.css")
      );

      // Use a nonce to only allow a specific script to be run.
      const nonce = getNonce();

      let listData = "";
      Object.keys(ACTIVE_USERS_DATA).map((key) => {
        if (ACTIVE_USERS_DATA[key].isSharing) {
          listData += `<option value="${key}">${ACTIVE_USERS_DATA[key].name}</option>`;
        }
      });

      return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">

				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">

				<meta name="viewport" content="width=device-width, initial-scale=1.0">

				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				
				<title>Cat Colors</title>
			</head>
			<body>
				<p>Start sharing your terminal with others in real-time.</p>

				<button class="styled-button" id="share-button">Start shared terminal</button>
                
                <hr>

                <p>Or you can also see other people's terminal.</p>
                <label for="user-list">Choose user whose shared terminal you want to see:</label>
                <br>
                <select name="user-list" class="styled-select" id="user-list">
                ${listData}
                </select>
                <button class="styled-button" id="receive-button">Show terminal</button>
                <p>If some user isn't on the list it means they don't share their terminal yet.</p>

				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    } catch (error) {
      handleError({
        error,
        location:
          "terminalSharing -> SharingManagementWebview -> _getHtmlForWebview",
      });
    }
  };

  return {
    resolveWebviewView,
    viewType: "sharingManagement",
    sendData,
  };
};

function getNonce() {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

// case "start-receiving": {
const startReceiving = async ({ userId }) => {
  try {
    let STARTING_TERMINAL = true;

    const userName = ACTIVE_USERS_DATA[userId].name;
    const terminal = vscode.window.createTerminal(`${userName}'s terminal`);

    let whileCounter = 0;

    while (STARTING_TERMINAL) {
      let response;
      try {
        response = await exec(
          `find /home/strove/.local -maxdepth 2 -name "output-${userId}.txt" -print -quit`
        );
      } catch (error) {
        response = null;
        handleError({
          error,
          location: "terminalSharing -> startReceiving -> find",
          additionalData: response,
        });
      }

      whileCounter++;

      await new Promise((resolve) =>
        setTimeout(() => {
          resolve();
        }, 500)
      );

      if (response && response.stdout) {
        await terminal.sendText(
          `tail -q -f /home/strove/.local/output-${userId}.txt`
        );

        await terminal.show();

        STARTING_TERMINAL = false;
      } else if (whileCounter >= 20) {
        await terminal.sendText(
          `echo "Error happened during terminal sharing. Try again later."`
        );

        await terminal.show();

        STARTING_TERMINAL = false;
      }
    }
  } catch (error) {
    handleError({
      error,
      location: "terminalSharing -> startReceiving",
      additionalData: userId,
    });
  }
};

const startSharing = async () => {
  try {
    // Start braodcasting terminal for everyone
    sharedTerminal = vscode.window.createTerminal("Shared terminal");

    sharedTerminal.sendText(
      `script -q -f /home/strove/.local/output-${myId}.txt`
    );

    sharedTerminal.sendText("clear");

    sharedTerminal.show();
  } catch (error) {
    handleError({
      error,
      location: "terminalSharing -> startSharing",
    });
  }
};

const restartSharing = async () => {
  try {
    if (sharedTerminal) {
      sharedTerminal.sendText("exit");

      await sharedTerminal.dispose();

      startSharing();
    } else {
      startSharing();
    }
  } catch (error) {
    handleError({
      error,
      location: "terminalSharing -> restartSharing",
    });
  }
};

const checkOutputFiles = async (webviewView) => {
  try {
    const { stdout, stderr } = await exec(`ls /home/strove/.local`);
    let shouldRefresh = false;

    if (stderr) throw `error: ${stderr}`;

    const fileNames = stdout.split("\n");

    fileNames.pop();

    const usersIds = fileNames
      .filter((fileName) => fileName.includes("output"))
      .map((fileName) => fileName.match(/(?<=\-)(.*)(?=\.)/g)[0]);

    usersIds.map((userId) => {
      if (ACTIVE_USERS_DATA[userId]) {
        // This map always sets isSharing to true,
        // so if it was false first then data has changed and webview should be refreshed
        if (!ACTIVE_USERS_DATA[userId].isSharing) shouldRefresh = true;

        ACTIVE_USERS_DATA[userId].isSharing = true;
      }
    });

    if (shouldRefresh && webviewView) {
      webviewView.sendData({
        message: "update-user-list",
        additionalData: ACTIVE_USERS_DATA,
      });
    }

    return usersIds;
  } catch (error) {
    handleError({
      error,
      location: "watchActiveUsers -> checkOutputFiles",
    });
  }
};

const findGuest = () => {
  const guest = Object.keys(ACTIVE_USERS_DATA).find(
    (userId) => ACTIVE_USERS_DATA[userId].type === "guest"
  );

  return guest;
};

const watchActiveUsersChange = async (webviewView) => {
  try {
    const watchActiveUsersOperation = {
      query: watchActiveUsersSubscription,
      variables: {
        projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
      },
    };

    watchActiveUsersSubscriber = execute(
      websocketLink,
      watchActiveUsersOperation
    ).subscribe({
      next: async (data) => {
        try {
          const {
            data: { watchActiveUsers },
          } = data;

          if (
            watchActiveUsers &&
            Array.isArray(watchActiveUsers) &&
            watchActiveUsers.length > 0
          ) {
            // In user:
            // id;
            // name;
            // fullName;
            // type;

            // I do it this way to interate through all users in one go
            // instead of doing two loops iterating on their own subset of data
            // and potentially messing up in the process
            const allUsers = [
              ...new Set([
                ...Object.keys(ACTIVE_USERS_DATA),
                ...watchActiveUsers.map((newUser) => newUser.id),
              ]),
            ];

            allUsers.forEach((userId) => {
              // ActiveUSers is a list of other active users so we want to filter current user out
              // I return false just because I want to do nothing in this case
              if (userId === myId) return false;

              const user = watchActiveUsers.find(
                (activeUser) => activeUser.id === userId
              );

              if (user) {
                ACTIVE_USERS_DATA[userId] = watchActiveUsers.find(
                  (activeUser) => activeUser.id === userId
                );
              } else {
                delete ACTIVE_USERS_DATA[userId];
              }
            });

            // This should refresh the TreeView
            vscode.commands.executeCommand("activeUsers.refresh");

            // I refresh this data in case someone left the project
            if (webviewView) {
              webviewView.sendData({
                message: "update-user-list",
                additionalData: ACTIVE_USERS_DATA,
              });
            }
          }
        } catch (error) {
          handleError({
            error,
            location: "watchActiveUsers -> watchActiveUsersSubscriber -> next",
            additionalData: watchActiveUsersOperation,
          });
        }
      },
      error: (error) =>
        handleError({
          error,
          location: "watchActiveUsers -> watchActiveUsersSubscriber -> error",
          additionalData: watchActiveUsersOperation,
        }),
      complete: () => console.log(`complete`),
    });
  } catch (error) {
    handleError({
      error,
      location: "watchActiveUsers -> watchActiveUsersChange",
    });
  }
};

const manageTerminalSharing = (context) => {
  try {
    // I add refresh ability to active users Tree View
    context.subscriptions.push(
      vscode.commands.registerCommand("activeUsers.refresh", (data) => {
        console.log("activeUsers.refresh -> data: ", data);
        ActiveUsersTreeDataProvider.refresh();
      })
    );

    const users = Object.keys(ACTIVE_USERS_DATA).map(
      (key) => ACTIVE_USERS_DATA[key].name
    );

    vscode.window.registerTreeDataProvider(
      "activeUsers",
      ActiveUsersTreeDataProvider(users)
    );

    const WebviewView = SharingManagementWebview(context.extensionUri);

    vscode.window.registerWebviewViewProvider(
      WebviewView.viewType,
      WebviewView
    );

    watchActiveUsersChange(WebviewView);

    checkOutputFilesInterval = setInterval(
      () => checkOutputFiles(WebviewView),
      5000
    );
  } catch (error) {
    handleError({
      error,
      location: "terminalSharing -> manageTerminalSharing -> error",
    });
  }
};

module.exports = {
  manageTerminalSharing,
  checkOutputFilesInterval,
  watchActiveUsersSubscriber,
};
