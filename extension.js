// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const throttle = require("lodash.throttle");
const { execute, makePromise } = require("apollo-link");
const Sentry = require("@sentry/node");
const {
  stroveLiveshareSubscription,
  liveshareActivity,
  focusEditorSubscription,
} = require("./utils/queries");
const { handleLiveshareResponse } = require("./utils/handleLiveshareResponse");
const { handleFocusEditor } = require("./utils/handleFocusEditor");
const { websocketLink } = require("./utils/websocketLink");
const {
  readTerminal,
  receiveTerminalSubscriber,
} = require("./utils/readTerminal");
const {
  manageTerminalSharing,
  manageTerminalSubscriber,
} = require("./utils/manageTerminalSharing");
const { startDebugging, sendLog } = require("./utils/debugger");
const {
  startAutomaticTest,
  autoTestTerminalSubscriber,
} = require("./utils/automaticTest");
const { startIOTest, startIOTestSubscriber } = require("./utils/handleIOTests");
const { checkInterval, monitorPorts } = require("./utils/handlePorts");
const { watchFileChange } = require("./utils/watchFileChange");

const environment = process.env.CODEALLY_ENVIRONMENT;
const userType = process.env.CODEALLY_USER_TYPE;

const { activeUsersMock } = require("./utils/dataMock");

Sentry.init({
  beforeSend(event) {
    if (environment === "production") {
      return event;
    }
    return null;
  },
  dsn: "https://8acd5bf9eafc402b8666e9d55186f620@o221478.ingest.sentry.io/5285294",
  maxValueLength: 1000,
  normalizeDepth: 10,
});

let initPing;

const liveshareActivityUpdate = (data) => {
  const liveshareActivityOperation = {
    query: liveshareActivity,
    variables: {
      userData: data,
    },
  };

  makePromise(execute(websocketLink, liveshareActivityOperation))
    .then()
    .catch((error) => {
      console.log(
        `received error in liveshareActivityUpdate ${JSON.stringify(error)}`
      );
      Sentry.withScope((scope) => {
        scope.setExtras({
          data: liveshareActivityOperation,
          location: "liveshareActivityUpdate",
        });
        Sentry.captureException(error);
      });
    });
};

const liveshareActivityInit = () => {
  const liveshareActivityOperation = {
    query: liveshareActivity,
    variables: {
      userData: {
        projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
        userId: process.env.CODEALLY_USER_ID || "123",
        fullName: process.env.CODEALLY_USER_FULL_NAME,
        photoUrl: process.env.CODEALLY_PHOTO_URL,
      },
    },
  };

  makePromise(execute(websocketLink, liveshareActivityOperation))
    .then()
    .catch((error) => {
      console.log(
        `received error in liveshareActivityInit ${JSON.stringify(error)}`
      );

      Sentry.withScope((scope) => {
        scope.setExtras({
          data: liveshareActivityOperation,
          location: "liveshareActivityInit",
        });
        Sentry.captureException(error);
      });
    });
};

const throttleLiveshareActivityCall = throttle(liveshareActivityUpdate, 100, {
  leading: true,
});

const users = Object.keys(activeUsersMock).map(
  (key) => activeUsersMock[key].name
);

// class TreeDataProvider {
//   // onDidChangeTreeData;
//   // data;

//   constructor() {
//     this.data = [
//       new TreeItem("Currently Active Users:", [
//         ...users.map((userName) => new TreeItem(userName)),
//       ]),
//     ];
//   }

//   getTreeItem(element) {
//     return element;
//   }

//   getChildren(element) {
//     if (element === undefined) {
//       return this.data;
//     }
//     return element.children;
//   }
// }

const TreeDataProvider = (name) => {
  // onDidChangeTreeData;
  // data;

  const data = [
    new TreeItem(name, [...users.map((userName) => new TreeItem(userName))]),
  ];

  return {
    getTreeItem: (element) => {
      return element;
    },

    getChildren: (element) => {
      if (element === undefined) {
        return data;
      }
      return element.children;
    },
  };
};

class TreeItem extends vscode.TreeItem {
  // children;

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

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
  const title = await vscode.window.showInputBox({
    prompt: "Type the new title for the Test View",
    placeHolder: "smth",
  });
  if (title) {
    console.log(title);
  }
  try {
    vscode.window.registerTreeDataProvider(
      "testTreeView",
      TreeDataProvider("Currently Active Users")
    );
    // Example usage:
    // sendLog("proba mikrofonu");
    if (environment !== "production") startDebugging();
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log("stroveteams extension is active");

    // First call to get cursor positions of other users
    // It doesn't seem to work - my assumption:
    // it gets called before subscription is set up and the info gets lost, hence setTimeout
    // setTimeout(liveshareActivityInit, 1000);
    initPing = setInterval(liveshareActivityInit, 1000);

    vscode.window.onDidChangeTextEditorSelection(
      ({ textEditor, selections }) => {
        // setTimeout(stopProject, idleTimeout);
        const data = {
          projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
          userId: process.env.CODEALLY_USER_ID || "123",
          fullName: process.env.CODEALLY_USER_FULL_NAME,
          photoUrl: process.env.CODEALLY_PHOTO_URL,
          documentPath: textEditor._documentData._uri.path,
          selections,
        };

        throttleLiveshareActivityCall(data);
      }
    );

    vscode.window.onDidChangeActiveTextEditor((textEditor) => {
      const data = {
        projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
        userId: process.env.CODEALLY_USER_ID || "123",
        fullName: process.env.CODEALLY_USER_FULL_NAME,
        photoUrl: process.env.CODEALLY_PHOTO_URL,
      };

      if (textEditor) {
        data.documentPath = textEditor._documentData._uri.path;
      }

      liveshareActivityUpdate(data);
    });

    let terminal;
    const terminals = vscode.window.terminals;

    startAutomaticTest();
    startIOTest();
    monitorPorts();
    watchFileChange();

    if (terminals.length) {
      terminal = vscode.window.terminals[0];
    } else {
      terminal = vscode.window.createTerminal("strove");
    }

    if (process.env.CODEALLY_INIT_COMMAND) {
      terminal.sendText(process.env.CODEALLY_INIT_COMMAND);
    }

    /* Used for local debugging */
    if (environment === "local" || !environment) {
      terminal.sendText(process.env.CODEALLY_INIT_COMMAND || "yarn start");
    }
    await terminal.show();

    sendLog(userType);

    if (userType === "guest") {
      const redirectedTerminal =
        vscode.window.createTerminal("Shared terminal");

      redirectedTerminal.sendText(
        `script -q -f /home/strove/.local/output-${process.env.CODEALLY_USER_ID}.txt`
      );

      redirectedTerminal.sendText("clear");

      await redirectedTerminal.show();
    } else if (userType === "hiring") {
      sendLog("in hiring");
      readTerminal();
    } else {
      manageTerminalSharing();
    }
  } catch (error) {
    console.log(`received error in activate ${error}`);

    Sentry.withScope((scope) => {
      scope.setExtras({
        location: "activate",
      });
      Sentry.captureException(error);
    });
  }
}

const stroveLiveshareOperation = {
  query: stroveLiveshareSubscription,
  variables: {
    userId: process.env.CODEALLY_USER_ID || "123",
    projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
  },
};

const liveshareSubscriber = execute(
  websocketLink,
  stroveLiveshareOperation
).subscribe({
  next: (data) => {
    const {
      data: { stroveLiveshare },
    } = data;

    if (initPing) {
      clearInterval(initPing);
      initPing = false;

      const userData = stroveLiveshare.find((userData) => {
        if (userData.documentPath && userData.documentPath > 0) return true;
      });

      if (userData)
        handleFocusEditor({
          uri: userData.documentPath,
          userPosition: userData.selections,
        });
    }

    handleLiveshareResponse(stroveLiveshare);
  },
  error: (error) => {
    console.log(
      `received error in liveshareSubscriber ${JSON.stringify(error)}`
    );

    Sentry.withScope((scope) => {
      scope.setExtras({
        data: stroveLiveshareOperation,
        location: "liveshareSubscriber",
      });
      Sentry.captureException(error);
    });
  },
  complete: () => console.log(`complete`),
});

const focusEditorOperation = {
  query: focusEditorSubscription,
  variables: {
    projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
  },
};

const focusEditorSubscriber = execute(
  websocketLink,
  focusEditorOperation
).subscribe({
  next: async (data) => {
    const {
      data: { focusEditor },
    } = data;

    handleFocusEditor({
      uri: focusEditor.documentPath,
      userPosition: focusEditor.selections,
    });
  },
  error: (error) => {
    console.log(
      `received error in focusEditorSubscriber ${JSON.stringify(error)}`
    );

    Sentry.withScope((scope) => {
      scope.setExtras({
        data: focusEditorOperation,
        location: "focusEditorSubscriber",
      });
      Sentry.captureException(error);
    });
  },
  complete: () => console.log(`complete`),
});

// this method is called when your extension is deactivated
function deactivate() {
  liveshareSubscriber.unsubscribe();
  focusEditorSubscriber.unsubscribe();
  receiveTerminalSubscriber.unsubscribe();
  manageTerminalSubscriber.unsubscribe();
  autoTestTerminalSubscriber.unsubscribe();
  startIOTestSubscriber.unsubscribe();
  clearInterval(checkInterval);
}

exports.activate = activate;
exports.deactivate = deactivate;

module.exports = {
  activate,
  deactivate,
};
