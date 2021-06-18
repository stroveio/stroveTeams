const activeUsersMock = {
  1234: {
    name: "Mark",
    id: 1234,
    isSharing: true,
    watchedTerminals: [5678],
  },
  4321: {
    name: "Jeff",
    id: 4321,
    isSharing: false,
    watchedTerminals: [5678, 1234],
  },
  7890: {
    name: "Fred",
    id: 7890,
    isSharing: false,
    watchedTerminals: [1234],
  },
  5678: {
    name: "Alice",
    id: 5678,
    isSharing: true,
    watchedTerminals: [],
  },
};

const meMock = {
  name: "Jeff",
  id: 4321,
  isSharing: false,
  watchedTerminals: [5678, 1234],
};

module.exports = {
  activeUsersMock,
  meMock,
};
