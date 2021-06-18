const vscode = require("vscode");
const Sentry = require("@sentry/node");
const { sendLog } = require("./debugger");
const { languagesData } = require("./runIOTests");
const { execute, makePromise } = require("apollo-link");
const { websocketLink } = require("./websocketLink");
const { setProjectDataMutation } = require("./queries");

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

const watchFileChange = async () => {
  const initialFileName = getInitialFileName();

  if (initialFileName) sendCurrentLanguage(initialFileName);

  vscode.window.onDidChangeActiveTextEditor(({ document }) => {
    // document.fileName /Users/mac/Desktop/SiliSky/gitTest/GitServerTesting/README.md
    // document.fileName /Users/mac/Desktop/SiliSky/gitTest/GitServerTesting/index.js
    // document.fileName /Users/mac/Desktop/SiliSky/gitTest/GitServerTesting/package.json
    // Despite the name it returns the whole path
    const { fileName } = document;

    const fileNameArray = fileName.split("/");
    const actualFileName = fileNameArray[fileNameArray.length - 1];

    console.log("actualFileName", actualFileName);

    sendLog(`actualFileName: ${actualFileName}`);

    sendCurrentLanguage(actualFileName);
  });
};

const getInitialFileName = () => {
  try {
    const initialFilePath = vscode.window.activeTextEditor.document.fileName;

    const initialFileNameArray = initialFilePath.split("/");
    const initialFileName =
      initialFileNameArray[initialFileNameArray.length - 1];

    console.log(
      "🚀 ~ file: extension.js ~ line 132 ~ activate ~ initialFileName",
      initialFileName
    );

    sendLog(
      `🚀 ~ file: extension.js ~ line 132 ~ activate ~ initialFileName: ${initialFileName}`
    );

    return initialFileName;
  } catch (e) {
    console.log(`received error in getInitialFile ${e}`);

    sendLog(`received error in getInitialFile ${e}`);

    Sentry.withScope((scope) => {
      scope.setExtras({
        location: "getInitialFile",
      });
      Sentry.captureException(e);
    });
    return false;
  }
};

const sendCurrentLanguage = async (fileName) => {
  try {
    const currentIOLanguage = Object.keys(languagesData).find(
      (language) => languagesData[language].fileName === fileName
    );
    sendLog(
      `🚀 ~ file: watchFileChange.js ~ line 40 ~ sendCurrentLanguage ~ currentIOLanguage: ${currentIOLanguage}`
    );

    // If no known file is focused, do not do anything
    if (!currentIOLanguage) return false;

    const setProjectData = {
      query: setProjectDataMutation,
      variables: {
        id: process.env.CODEALLY_CURRENT_PROJECT_ID || "123abc",
        currentIOLanguage,
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
        sendLog(`received error in sendCurrentLanguage ${error}`);
        console.log(
          `received error in sendCurrentLanguage ${JSON.stringify(error)}`
        );

        Sentry.withScope((scope) => {
          scope.setExtras({
            data: setProjectData,
            location: "sendCurrentLanguage -> mutation",
          });
          Sentry.captureException(error);
        });
      });

    return true;
  } catch (e) {
    console.log(`received error in sendCurrentLanguage ${e}`);

    sendLog(`received error in sendCurrentLanguage ${e}`);

    Sentry.withScope((scope) => {
      scope.setExtras({
        data: { fileName },
        location: "sendCurrentLanguage",
      });
      Sentry.captureException(e);
    });
  }
};

module.exports = {
  watchFileChange,
};
