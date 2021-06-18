(() => {
  const vscode = acquireVsCodeApi();

  const state = vscode.getState();

  let isSharingTerminalOpen = state.isSharingTerminalOpen;

  if (isSharingTerminalOpen) {
    document.querySelector("#share-button").innerHTML =
      "Restart shared terminal";
  }

  const sendInstruction = (instruction, additionalData = {}) =>
    vscode.postMessage({ instruction, additionalData });

  document.querySelector("#receive-button").addEventListener("click", () => {
    const userId = document.querySelector("#user-list").value;

    sendInstruction("start-receiving", { userId });
  });

  document.querySelector("#share-button").addEventListener("click", () => {
    if (isSharingTerminalOpen) {
      sendInstruction("restart-sharing");
    } else {
      sendInstruction("start-sharing");
      vscode.setState({ isSharingTerminalOpen: true });
      isSharingTerminalOpen = true;
      // isSharingTerminalOpen = true;
      document.querySelector("#share-button").innerHTML =
        "Restart shared terminal";
    }
  });

  // Handle messages sent from the extension to the webview
  window.addEventListener("message", (event) => {
    const { message, additionalData } = event.data; // The json data that the extension sent
    switch (message) {
      case "update-user-list": {
        let listData = "";
        Object.keys(additionalData).map((key) => {
          if (additionalData[key].isSharing) {
            listData += `<option value="${key}">${additionalData[key].name}</option>`;
          }
        });
        document.querySelector("#user-list").innerHTML = listData;
        break;
      }
      case "set-sharing-flag-true": {
        vscode.setState({ isSharingTerminalOpen: true });
        isSharingTerminalOpen = true;
        document.querySelector("#share-button").innerHTML =
          "Restart shared terminal";
        break;
      }
      case "reset-state": {
        vscode.setState({ isSharingTerminalOpen: false });
        isSharingTerminalOpen = false;
        document.querySelector("#share-button").innerHTML =
          "Start shared terminal";
        break;
      }
    }
  });

  sendInstruction("initialized");
})();
