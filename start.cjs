// npm start always runs the compiled production server, even on machines where
// NODE_ENV was not set by the hosting provider.
process.env.NODE_ENV = 'production';
require('./dist/server.cjs');
