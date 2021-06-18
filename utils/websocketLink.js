const { WebSocketLink } = require("apollo-link-ws");
const { SubscriptionClient } = require("subscriptions-transport-ws");
const ws = require("ws");

const { websocketEndpoint } = require("./endpoints");

const client = new SubscriptionClient(
  websocketEndpoint,
  {
    reconnect: true,
    connectionParams: () => ({
      authorization: process.env.CODEALLY_USER_TOKEN
        ? `Bearer ${process.env.CODEALLY_USER_TOKEN}`
        : "",
    }),
  },
  ws
);

module.exports = {
  websocketLink: new WebSocketLink(client),
};
