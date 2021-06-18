const vscode = require("vscode");
const Sentry = require("@sentry/node");
const { execute, makePromise } = require("apollo-link");
const { websocketLink } = require("./websocketLink");
const {
  receiveAutomaticTestSubscription,
  setProjectDataMutation,
} = require("./queries");
const child_process = require("child_process");
const { sendLog } = require("./debugger");
const { createWebview, reloadWebview } = require("./webview");

const environment = process.env.CODEALLY_ENVIRONMENT;

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

const receiveTerminalOperation = {
  query: receiveAutomaticTestSubscription,
  variables: {
    projectId: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
  },
};

let autoTestTerminalSubscriber = null;
let testRunningFlag = false;
let testProcess;

const startAutomaticTest = () => {
  // Start terminal if ping arrives
  autoTestTerminalSubscriber = execute(
    websocketLink,
    receiveTerminalOperation
  ).subscribe({
    next: async (data) => {
      try {
        const {
          data: { automaticTest },
        } = data;

        if (
          automaticTest &&
          automaticTest.command.includes(
            "strove_receive_automatic_test_ping"
          ) &&
          !testRunningFlag
        ) {
          // const terminalWriter = await startTestTerminal();
          let webviewPanel;
          let html = "<h3>Automatic test results will be visible below:</h3>";

          let refreshWebviewInterval;

          testProcess = {
            process: child_process.spawn("/bin/bash"),
            send: () => {
              // Important to end process with ; exit\n
              sendLog(
                `cd ${automaticTest.folderName} && ${automaticTest.testStartCommand} ; exit\n`
              );

              // Locking the ability to run the test again before previous instance finishes
              testRunningFlag = true;

              webviewPanel = createWebview({ html });

              testProcess.process.stdin.write(
                `cd ${automaticTest.folderName} && ${automaticTest.testStartCommand} ; exit\n`
              );

              refreshWebviewInterval = setInterval(
                () =>
                  reloadWebview({
                    panel: webviewPanel,
                    html: `<pre>${html}</pre>`,
                  }),
                500
              );
            },
            initEvents: () => {
              // Handle Data
              testProcess.process.stdout.on("data", (buffer) => {
                let response = buffer.toString("utf-8");

                sendLog(`startAutomaticTest - STDOUT: ${response}`);

                response = response.split(/[\r\n\t]+/g);
                response =
                  response.length > 1 ? response.join("\r\n") : response[0];

                html += response;

                // terminalWriter.fire(response);
              });

              testProcess.process.stderr.on("data", (buffer) => {
                let response = buffer.toString("utf-8");

                sendLog(
                  `startAutomaticTest - STDERR: ${buffer.toString("utf-8")}`
                );

                response = response.split(/[\r\n\t]+/g);
                response =
                  response.length > 1 ? response.join("\r\n") : response[0];

                html += response;

                // terminalWriter.fire(response);
              });

              // Handle Closure
              testProcess.process.on("exit", (exitCode) => {
                sendLog(`startAutomaticTest - exit: ${exitCode}`);
                clearInterval(refreshWebviewInterval);

                if (exitCode === 0) {
                  sendOutput("Test Passed.");
                } else {
                  sendOutput("Test Failed.");
                }

                if (
                  process.env.TEST_REPORT_PATH &&
                  process.env.SHOW_TEST_REPORT
                ) {
                  reloadWebview({
                    panel: webviewPanel,
                    path: `/home/strove/project/${process.env.TEST_REPORT_PATH}`,
                  });
                } else {
                  reloadWebview({
                    panel: webviewPanel,
                    html: `<pre>${html}</pre>`,
                  });
                }

                testRunningFlag = false;
              });
            },
          };

          testProcess.initEvents();
          testProcess.send();
        }
      } catch (e) {
        sendLog(`startAutomaticTest - tryCatch: ${JSON.stringify(e)}`);

        console.log(
          `received error in startAutomaticTest -> autoTestTerminalSubscriber -> next ${JSON.stringify(
            e
          )}`
        );

        Sentry.withScope((scope) => {
          scope.setExtras({
            data: receiveTerminalOperation,
            location:
              "startAutomaticTest -> autoTestTerminalSubscriber -> next",
          });
          Sentry.captureException(e);
        });
      }
    },
    error: (error) => {
      sendLog(`startAutomaticTest - error: ${JSON.stringify(error)}`);
      console.log(
        `received error in autoTestTerminalSubscriber ${JSON.stringify(error)}`
      );

      Sentry.withScope((scope) => {
        scope.setExtras({
          data: receiveTerminalOperation,
          location: "startAutomaticTest -> autoTestTerminalSubscriber",
        });
        Sentry.captureException(error);
      });
    },
    complete: () => console.log(`complete`),
  });
};

const sendOutput = async (output) => {
  try {
    const setProjectData = {
      query: setProjectDataMutation,
      variables: {
        id: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
        testOutput: output,
      },
    };

    sendLog(`sendOutput - variables: ${setProjectData.variables}`);

    makePromise(execute(websocketLink, setProjectData))
      .then()
      .catch((error) => {
        console.log(`received error in sendOutput ${JSON.stringify(error)}`);

        Sentry.withScope((scope) => {
          scope.setExtras({
            data: setProjectData,
            location: "sendOutput -> mutation",
          });
          Sentry.captureException(error);
        });
      });
  } catch (e) {
    sendLog(`sendOutput - tryCatch: ${e}`);
    console.log("error in sendOutput: ", e);
    Sentry.withScope((scope) => {
      scope.setExtras({
        data: { error: e },
        location: "sendOutput",
      });
      Sentry.captureMessage("Unexpected error!");
    });
  }
};

const startTestTerminal = async () => {
  const writeEmitter = new vscode.EventEmitter();

  const pty = {
    onDidWrite: writeEmitter.event,
    open: () => {
      writeEmitter.fire(`Automatic test results will show below:\n\r\n\r`);
    },
    close: () => {
      // no-op
      return;
    },
    handleInput: () => {
      // disabling inputs
      return;
    },
  };

  const testsTerminal = vscode.window.createTerminal({
    name: `Test Results`,
    pty,
  });

  await testsTerminal.show();

  // We wait for the terminal to show up
  await new Promise((resolve) =>
    setTimeout(() => {
      resolve();
    }, 2000)
  );

  return writeEmitter;
};

module.exports = {
  startAutomaticTest,
  autoTestTerminalSubscriber,
};
