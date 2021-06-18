const vscode = require("vscode");
const Sentry = require("@sentry/node");

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

let liveshareActivity = {};
let decorationTypes = [];

const decorate = ({ decorationArray, decorationType }) => {
  const editor = vscode.window.activeTextEditor;

  editor.setDecorations(decorationType, decorationArray);
};

const createDecorationType = ({ userData }) =>
  vscode.window.createTextEditorDecorationType({
    border: `1px solid hsla(${userData.color}, 80%, 70%, 1)`,
    backgroundColor: `hsla(${userData.color}, 80%, 70%, 0.3)`,
    // after: {
    //   height: "15px",
    //   width: "15px",
    //   // contentIconPath: vscode.Uri.parse(
    //   //   "https://avatars1.githubusercontent.com/u/14284341?v=4"
    //   // ),
    //   color: userData.color,
    //   contentText: userData.fullName,
    // },
  });

const createUserNameDecorationType = ({ userData }) =>
  vscode.window.createTextEditorDecorationType({
    after: {
      margin: "20px",
      /* This can be used to pass avatar but we need to resize it on the server side first */
      // contentIconPath: vscode.Uri.parse(
      //   "https://avatars1.githubusercontent.com/u/14284341?v=4"
      // ),
      fontWeight: "900",
      color: `hsla(${userData.color}, 80%, 70%, 1)`,
      contentText: ` ${userData.fullName}`,
    },
  });

const handleLiveshareResponse = (userDataArray) => {
  decorationTypes.forEach((type) => type.dispose());

  // console.log("userDataArray.length", userDataArray.length);

  userDataArray.forEach((userData) => {
    const userId = userData.userId;

    /* Skip decorating editor using users own activity data */
    if (
      (userId && userId !== process.env.CODEALLY_USER_ID) ||
      (userId && !environment)
    ) {
      /*
      We create a new object because liveshareActivity[userId] = userData has
      circular type and node does not show it's contents in the console making
      debugging harder.
    */
      liveshareActivity[userId] = {
        ...userData,
      };

      const editor = vscode.window.activeTextEditor;
      const isEditorPathTheSameAsUsers =
        userData &&
        editor &&
        editor._documentData &&
        editor._documentData._uri &&
        editor._documentData._uri.path === userData.documentPath;

      if (isEditorPathTheSameAsUsers) {
        const codeDecorationType = createDecorationType({
          userData,
        });

        /* Need to make another decoration just to append user name at the end of the last selected line */
        const userNameDecorationType = createUserNameDecorationType({
          userData,
        });

        let lastLine;

        if (
          userData &&
          userData["selections"] &&
          userData["selections"][0] &&
          userData["selections"][0]["end"]
        ) {
          lastLine = userData["selections"][0]["end"]["line"];
        }

        if (
          userData &&
          userData["selections"] &&
          (lastLine || lastLine === 0) &&
          editor &&
          editor._documentData &&
          editor._documentData._lines &&
          (editor._documentData._lines[lastLine] ||
            editor._documentData._lines[lastLine] === "")
        ) {
          const lastLineLastCharacterPosition =
            editor._documentData._lines[lastLine].length;

          decorationTypes = [
            ...decorationTypes,
            codeDecorationType,
            userNameDecorationType,
          ];

          /* Decorate code */
          decorate({
            decorationArray: [
              {
                range: new vscode.Range(
                  new vscode.Position(
                    userData["selections"][0]["start"]["line"],
                    userData["selections"][0]["start"]["character"]
                  ),
                  new vscode.Position(
                    userData["selections"][0]["end"]["line"],
                    userData["selections"][0]["end"]["character"]
                  )
                ),
              },
            ],
            decorationType: codeDecorationType,
          });

          /* Append user name at the end */
          decorate({
            decorationArray: [
              {
                range: new vscode.Range(
                  new vscode.Position(
                    userData["selections"][0]["end"]["line"],
                    lastLineLastCharacterPosition
                  ),
                  new vscode.Position(
                    userData["selections"][0]["end"]["line"],
                    lastLineLastCharacterPosition
                  )
                ),
              },
            ],
            decorationType: userNameDecorationType,
          });
        } else {
          Sentry.withScope((scope) => {
            scope.setExtras({
              data: {
                editor: editor._documentData,
                userData: userData,
              },
              location: "handleLiveshareResponse",
            });
            Sentry.captureMessage("Incomplete data provided");
          });
        }
      }
    }
  });
};

module.exports = {
  handleLiveshareResponse,
};
