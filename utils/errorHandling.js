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

const handleError = ({ error, location, additionalData = {} }) => {
  console.log(`received error in ${location}: ${JSON.stringify(error)}`);

  sendLog(`received error in ${location}: ${error}`);

  Sentry.withScope((scope) => {
    scope.setExtras({
      data: additionalData,
      location,
    });
    Sentry.captureException(error);
  });
};

module.exports = {
  handleError,
};
