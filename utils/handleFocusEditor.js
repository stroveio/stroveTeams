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

const handleFocusEditor = async ({ uri, userPosition }) => {
  try {
    const editorPath = vscode.Uri.file(uri);

    const editor = await vscode.window.showTextDocument(editorPath);

    if (userPosition && userPosition.start && userPosition.end) {
      const range = new vscode.Range(
        new vscode.Position(
          userPosition.start.line,
          userPosition.start.character
        ),
        new vscode.Position(userPosition.end.line, userPosition.end.character)
      );

      editor.revealRange(range, 1);
    }
  } catch (e) {
    console.log(`Error in handleFocusEditor: ${e}`);
    Sentry.withScope((scope) => {
      scope.setExtras({
        data: { uri, userPosition },
        location: "handleFocusEditor",
      });
      Sentry.captureException(e);
    });
  }
};

module.exports = {
  handleFocusEditor,
};
