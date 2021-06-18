const environment = process.env.CODEALLY_ENVIRONMENT;

let endpoint;
let websocketEndpoint;
let idleTimeout = process.env.CODEALLY_IDLE_TIMEOUT;

if (environment === "local" || !environment) {
  idleTimeout = 5000;
  endpoint = "http://localhost:4040";
  websocketEndpoint = "ws://localhost:4040/graphql";
} else if (environment === "development") {
  endpoint = "https://graphql.codeally.io";
  websocketEndpoint = "wss://graphql.codeally.io/graphql";
} else {
  endpoint = "https://api.codeally.io/graphql";
  websocketEndpoint = "wss://api.codeally.io/graphql";
}

const liveshareActivityEndpoint = `${endpoint}/liveshareActivity`;
const graphqlEndpoint = `${endpoint}/graphql`;

module.exports = {
  graphqlEndpoint,
  liveshareActivityEndpoint,
  websocketEndpoint,
  idleTimeout,
};
