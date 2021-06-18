const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const Sentry = require("@sentry/node");

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

const createWebview = ({ path, html, title = "Test Results" }) => {
  try {
    const panel = vscode.window.createWebviewPanel(
      "html",
      title,
      vscode.ViewColumn.One,
      {}
    );

    if (path) {
      const pathToHtml = vscode.Uri.file(path);

      const pathUri = pathToHtml.with({ scheme: "vscode-resource" });

      const fileContent = fs.readFileSync(pathUri.fsPath, "utf8");

      if (checkIfHTMLFile(path)) {
        panel.webview.html = fileContent;
      } else {
        panel.webview.html = `<pre>${fileContent}</pre>`;
      }
    }

    if (html) {
      panel.webview.html = html;
    }

    return panel;
  } catch (e) {
    console.log(
      `received error in webview -> createWebview ${JSON.stringify(e)}`
    );

    sendLog(`received error in webview -> createWebview ${JSON.stringify(e)}`);

    Sentry.withScope((scope) => {
      scope.setExtras({
        data: path,
        location: "webview -> createWebview",
      });
      Sentry.captureException(e);
    });
  }
};

const reloadWebview = ({ path, html, panel }) => {
  try {
    if (path) {
      const pathToHtml = vscode.Uri.file(path);

      const pathUri = pathToHtml.with({ scheme: "vscode-resource" });

      const fileContent = fs.readFileSync(pathUri.fsPath, "utf8");

      if (checkIfHTMLFile(path)) {
        panel.webview.html = fileContent;
      } else {
        panel.webview.html = `<pre>${fileContent}</pre>`;
      }
    }

    if (html) {
      panel.webview.html = html;
    }
  } catch (e) {
    console.log(
      `received error in webview -> reloadWebview ${JSON.stringify(e)}`
    );

    sendLog(`received error in webview -> reloadWebview ${JSON.stringify(e)}`);

    Sentry.withScope((scope) => {
      scope.setExtras({
        data: path,
        location: "webview -> reloadWebview",
      });
      Sentry.captureException(e);
    });
  }
};

const checkIfHTMLFile = (path) => {
  const temp = path.slice(path.length - 4);

  if (temp === "html") return true;

  return false;
};

module.exports = {
  createWebview,
  reloadWebview,
};
