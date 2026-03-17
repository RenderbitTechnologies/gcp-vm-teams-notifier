const functions = require("@google-cloud/functions-framework");

functions.cloudEvent("processVmEvent", async (cloudEvent) => {
  console.log(`Received Pub/Sub Event: ${cloudEvent.id}`);

  // 1. Decode the Pub/Sub Message
  const base64Data = cloudEvent.data.message.data;
  const decodedData = Buffer.from(base64Data, "base64").toString("utf-8");
  let auditLog;

  try {
    auditLog = JSON.parse(decodedData);
  } catch (err) {
    console.error("Failed to parse Pub/Sub message as JSON", err);
    return;
  }

  // 2. Extract Event Details
  // The structure matches v1.compute.instances.insert
  const projectId = auditLog.resource?.labels?.project_id || "Unknown Project";
  const instanceId =
    auditLog.resource?.labels?.instance_id || "Unknown Instance";
  const zone = auditLog.resource?.labels?.zone || "Unknown Zone";

  // Who performed the action
  const creator =
    auditLog.protoPayload?.authenticationInfo?.principalEmail || "Unknown User";

  // Resource name (usually the actual VM name rather than numeric ID)
  const resourceName =
    auditLog.protoPayload?.resourceName || `instances/${instanceId}`;
  const vmNameMatch = resourceName.match(/instances\/(.+)$/);
  const vmName = vmNameMatch ? vmNameMatch[1] : instanceId;

  console.log(`VM Created: ${vmName} in ${projectId} by ${creator}`);

  // 3. Determine Microsoft Teams Webhook URL
  const webhookMapRaw = process.env.WEBHOOK_MAP || "{}";
  let webhookMap = {};
  try {
    webhookMap = JSON.parse(webhookMapRaw);
  } catch (err) {
    console.error("Failed to parse WEBHOOK_MAP environment variable.", err);
  }

  const defaultWebhookUrl = webhookMap["default"];
  const projectWebhookUrl = webhookMap[projectId];
  const webhookUrl = projectWebhookUrl || defaultWebhookUrl;

  if (!webhookUrl) {
    console.warn(
      `No webhook configured for project ${projectId} and no default webhook found. Exiting.`,
    );
    return;
  }

  // 4. Construct Teams AdaptiveCard Payload
  const adaptiveCard = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
            {
              type: "TextBlock",
              size: "Large",
              weight: "Bolder",
              text: "🚀 New GCP VM Created",
            },
            {
              type: "FactSet",
              facts: [
                { title: "VM Name:", value: vmName },
                { title: "Project:", value: projectId },
                { title: "Zone:", value: zone },
                { title: "Created By:", value: creator },
              ],
            },
          ],
          actions: [
            {
              type: "Action.OpenUrl",
              title: "View in GCP Console",
              url: `https://console.cloud.google.com/compute/instancesDetail/zones/${zone}/instances/${vmName}?project=${projectId}`,
            },
          ],
        },
      },
    ],
  };

  // 5. Send POST Request to Teams
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(adaptiveCard),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Teams Webhook responded with status ${response.status}: ${errorText}`,
      );
    } else {
      console.log("Successfully sent notification to MS Teams.");
    }
  } catch (error) {
    console.error("Network error sending request to MS Teams", error);
  }
});
