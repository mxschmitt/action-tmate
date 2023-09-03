module.exports = {
  clearMocks: true,
  testEnvironment: 'node',
  verbose: true,
  collectCoverage: true,
  transform: {
    "^.+\\.(js)$": "babel-jest",
  },
}