const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");
const { getFunction } = require("@google-cloud/functions-framework/testing");

// Registers processVmEvent with the Functions Framework.
require("../index.js");

const processVmEvent = getFunction("processVmEvent");

const DEFAULT_WEBHOOK = "https://webhook.example.com/default";
const PROD_WEBHOOK = "https://webhook.example.com/prod";

function buildAuditLog(overrides = {}) {
  return {
    protoPayload: {
      authenticationInfo: { principalEmail: "alice@example.com" },
      resourceName: "projects/my-project/zones/us-central1-a/instances/web-1",
    },
    resource: {
      labels: {
        project_id: "my-project",
        instance_id: "1234567890",
        zone: "us-central1-a",
      },
    },
    ...overrides,
  };
}

function buildCloudEvent(payload) {
  const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
  return {
    id: "test-event-1",
    data: { message: { data: Buffer.from(raw).toString("base64") } },
  };
}

function mockFetch(impl) {
  return mock.method(
    globalThis,
    "fetch",
    impl ?? (async () => ({ ok: true, status: 200, text: async () => "" })),
  );
}

function sentCard(fetchMock, callIndex = 0) {
  const [, options] = fetchMock.mock.calls[callIndex].arguments;
  return JSON.parse(options.body);
}

function factsOf(card) {
  const factSet = card.attachments[0].content.body.find(
    (block) => block.type === "FactSet",
  );
  return Object.fromEntries(factSet.facts.map((f) => [f.title, f.value]));
}

describe("processVmEvent", () => {
  let originalWebhookMap;
  let consoleError;
  let consoleWarn;

  beforeEach(() => {
    originalWebhookMap = process.env.WEBHOOK_MAP;
    process.env.WEBHOOK_MAP = JSON.stringify({ default: DEFAULT_WEBHOOK });
    mock.method(console, "log", () => {});
    consoleError = mock.method(console, "error", () => {});
    consoleWarn = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    if (originalWebhookMap === undefined) {
      delete process.env.WEBHOOK_MAP;
    } else {
      process.env.WEBHOOK_MAP = originalWebhookMap;
    }
    mock.restoreAll();
  });

  it("posts an AdaptiveCard with the VM details to the default webhook", async () => {
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, options] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, DEFAULT_WEBHOOK);
    assert.equal(options.method, "POST");
    assert.equal(options.headers["Content-Type"], "application/json");

    const card = sentCard(fetchMock);
    assert.equal(card.type, "message");
    assert.equal(
      card.attachments[0].contentType,
      "application/vnd.microsoft.card.adaptive",
    );
    assert.equal(card.attachments[0].content.type, "AdaptiveCard");

    const consoleUrl =
      "https://console.cloud.google.com/compute/instancesDetail/zones/us-central1-a/instances/web-1?project=my-project";
    assert.deepEqual(factsOf(card), {
      "VM Name:": `[web-1](${consoleUrl})`,
      "Project:": "my-project",
      "Zone:": "us-central1-a",
      "Created By:": "alice@example.com",
    });
    assert.deepEqual(card.attachments[0].content.actions, [
      { type: "Action.OpenUrl", title: "View in GCP Console", url: consoleUrl },
    ]);
  });

  it("uses the project-specific webhook when one is configured", async () => {
    process.env.WEBHOOK_MAP = JSON.stringify({
      default: DEFAULT_WEBHOOK,
      "my-project": PROD_WEBHOOK,
    });
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.calls[0].arguments[0], PROD_WEBHOOK);
  });

  it("falls back to the default webhook for projects without an override", async () => {
    process.env.WEBHOOK_MAP = JSON.stringify({
      default: DEFAULT_WEBHOOK,
      "other-project": PROD_WEBHOOK,
    });
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.calls[0].arguments[0], DEFAULT_WEBHOOK);
  });

  it("uses a project override even when no default webhook exists", async () => {
    process.env.WEBHOOK_MAP = JSON.stringify({ "my-project": PROD_WEBHOOK });
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.calls[0].arguments[0], PROD_WEBHOOK);
  });

  it("uses the instance ID as the VM name when resourceName is missing", async () => {
    const fetchMock = mockFetch();
    const auditLog = buildAuditLog();
    delete auditLog.protoPayload.resourceName;

    await processVmEvent(buildCloudEvent(auditLog));

    assert.match(factsOf(sentCard(fetchMock))["VM Name:"], /^\[1234567890\]/);
  });

  it("fills in placeholders when the audit log lacks details", async () => {
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent({}));

    assert.equal(fetchMock.mock.callCount(), 1);
    const facts = factsOf(sentCard(fetchMock));
    assert.equal(facts["Project:"], "Unknown Project");
    assert.equal(facts["Zone:"], "Unknown Zone");
    assert.equal(facts["Created By:"], "Unknown User");
    assert.match(facts["VM Name:"], /^\[Unknown Instance\]/);
  });

  it("does not call Teams when the message is not valid JSON", async () => {
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent("not json {"));

    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(consoleError.mock.callCount(), 1);
  });

  it("does not call Teams when WEBHOOK_MAP is unset", async () => {
    delete process.env.WEBHOOK_MAP;
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(consoleWarn.mock.callCount(), 1);
  });

  it("does not call Teams when WEBHOOK_MAP is not valid JSON", async () => {
    process.env.WEBHOOK_MAP = "{not valid";
    const fetchMock = mockFetch();

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(fetchMock.mock.callCount(), 0);
    assert.equal(consoleError.mock.callCount(), 1);
    assert.equal(consoleWarn.mock.callCount(), 1);
  });

  it("logs, rather than throws, when Teams returns an error status", async () => {
    mockFetch(async () => ({
      ok: false,
      status: 400,
      text: async () => "Bad payload",
    }));

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(consoleError.mock.callCount(), 1);
    assert.match(consoleError.mock.calls[0].arguments[0], /400: Bad payload/);
  });

  it("logs, rather than throws, when the request to Teams fails", async () => {
    mockFetch(async () => {
      throw new Error("ECONNRESET");
    });

    await processVmEvent(buildCloudEvent(buildAuditLog()));

    assert.equal(consoleError.mock.callCount(), 1);
    assert.match(consoleError.mock.calls[0].arguments[0], /Network error/);
  });
});
