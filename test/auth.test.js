const test = require('node:test');
const assert = require('node:assert/strict');

const loadAuthMiddleware = ({ primary, secondary } = {}) => {
  const previousPrimary = process.env.API_KEY;
  const previousSecondary = process.env.API_KEY_SECONDARY;

  if (primary === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = primary;
  }

  if (secondary === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = secondary;
  }

  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/middleware/auth')];
  const authMiddleware = require('../src/middleware/auth');

  if (previousPrimary === undefined) {
    delete process.env.API_KEY;
  } else {
    process.env.API_KEY = previousPrimary;
  }

  if (previousSecondary === undefined) {
    delete process.env.API_KEY_SECONDARY;
  } else {
    process.env.API_KEY_SECONDARY = previousSecondary;
  }

  return authMiddleware;
};

const invokeAuth = (authMiddleware, providedKey) => {
  let nextCalled = false;
  let responseStatus;
  let responseBody;

  authMiddleware(
    {
      header: (name) => (name === 'X-API-Key' ? providedKey : undefined),
    },
    {
      status: (statusCode) => {
        responseStatus = statusCode;
        return {
          json: (body) => {
            responseBody = body;
          },
        };
      },
    },
    () => {
      nextCalled = true;
    },
  );

  return { nextCalled, responseStatus, responseBody };
};

test('auth middleware allows primary API key', () => {
  const authMiddleware = loadAuthMiddleware({ primary: 'primary-key', secondary: 'secondary-key' });

  const result = invokeAuth(authMiddleware, 'primary-key');

  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});

test('auth middleware allows secondary API key', () => {
  const authMiddleware = loadAuthMiddleware({ primary: 'primary-key', secondary: 'secondary-key' });

  const result = invokeAuth(authMiddleware, 'secondary-key');

  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});

test('auth middleware rejects missing or mismatched API key when configured', () => {
  const authMiddleware = loadAuthMiddleware({ primary: 'primary-key', secondary: 'secondary-key' });

  assert.deepEqual(invokeAuth(authMiddleware), {
    nextCalled: false,
    responseStatus: 401,
    responseBody: { error: 'unauthorized', details: 'Valid API key required' },
  });
  assert.deepEqual(invokeAuth(authMiddleware, 'wrong-key'), {
    nextCalled: false,
    responseStatus: 401,
    responseBody: { error: 'unauthorized', details: 'Valid API key required' },
  });
});

test('auth middleware is disabled when no API keys are configured', () => {
  const authMiddleware = loadAuthMiddleware();

  const result = invokeAuth(authMiddleware);

  assert.equal(result.nextCalled, true);
  assert.equal(result.responseStatus, undefined);
});
