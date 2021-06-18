const Sentry = require("@sentry/node");
const { execute, makePromise } = require("apollo-link");
const { websocketLink } = require("./websocketLink");
const { startIOTestMutation, setProjectDataMutation } = require("./queries");
const { sendLog } = require("./debugger");

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

const startIOTestOperation = {
  query: startIOTestMutation,
  variables: {
    projectId:
      process.env.CODEALLY_ORIGINAL_PROJECT_ID || "60702e7b231de583c1e3e883",
  },
};

let startIOTestSubscriber = null;
let readyToTest = true;

const startIOTest = () => {
  sendLog(`in function`);
  try {
    startIOTestSubscriber = execute(
      websocketLink,
      startIOTestOperation
    ).subscribe({
      next: async (data) => {
        sendLog(`in subscribe`);
        console.log("subscription fired");
        try {
          const {
            data: { startIOTest },
          } = data;
          sendLog(
            "🚀 ~ file: handleIOTests.js ~ line 46 ~ next: ~ startIOTest",
            startIOTest
          );

          if (startIOTest.language && readyToTest) {
            sendLog("in if");
            readyToTest = false;

            const { runIOTests } = require("./runIOTests");

            let outputs = await runIOTests(startIOTest);

            await sendIOTestOutput({ outputs, language: startIOTest.language });
            readyToTest = true;
          }
        } catch (e) {
          sendLog(`startIOTest - tryCatch: ${JSON.stringify(e)}`);

          console.log(
            `received error in startIOTest -> startIOTestSubscriber -> next ${e}`
          );

          Sentry.withScope((scope) => {
            scope.setExtras({
              data: startIOTestOperation,
              location: "startIOTest -> startIOTestSubscriber -> next",
            });
            Sentry.captureException(e);
          });
        }
      },
      error: (error) => {
        sendLog(`startIOTest - error: ${JSON.stringify(error)}`);
        console.log(
          `received error in startIOTestSubscriber ${JSON.stringify(error)}`
        );

        Sentry.withScope((scope) => {
          scope.setExtras({
            data: startIOTestOperation,
            location: "startIOTest -> startIOTestSubscriber",
          });
          Sentry.captureException(error);
        });
      },
      complete: () => console.log(`complete`),
    });
    sendLog(`after subscribe`);
  } catch (e) {
    sendLog(`startIOTest - tryCatch: ${e}`);
    console.log("error in startIOTest: ", e);
    Sentry.withScope((scope) => {
      scope.setExtras({
        data: { error: e },
        location: "startIOTest",
      });
      Sentry.captureMessage("Unexpected error!");
    });
  }
  sendLog(`after catch`);
};

const sendIOTestOutput = async ({ outputs, language }) => {
  try {
    const setProjectData = {
      query: setProjectDataMutation,
      variables: {
        id: process.env.CODEALLY_ORIGINAL_PROJECT_ID || "123abc",
        ioTestOutputs: [
          {
            language,
            outputs,
          },
        ],
      },
    };

    sendLog(
      `sendIOTestOutput - variables: ${JSON.stringify(
        setProjectData.variables
      )}`
    );

    makePromise(execute(websocketLink, setProjectData))
      .then((data) => sendLog(JSON.stringify(data)))
      .catch((error) => {
        sendLog(`received error in sendIOTestOutput ${error}`);
        console.log(
          `received error in sendIOTestOutput ${JSON.stringify(error)}`
        );

        Sentry.withScope((scope) => {
          scope.setExtras({
            data: setProjectData,
            location: "sendIOTestOutput -> mutation",
          });
          Sentry.captureException(error);
        });
      });
  } catch (e) {
    sendLog(`sendIOTestOutput - tryCatch: ${e}`);
    console.log("error in sendIOTestOutput: ", e);
    Sentry.withScope((scope) => {
      scope.setExtras({
        data: { error: e },
        location: "sendIOTestOutput",
      });
      Sentry.captureMessage("Unexpected error!");
    });
  }
};

module.exports = {
  startIOTest,
  startIOTestSubscriber,
};
