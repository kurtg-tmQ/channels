import { Meteor } from "meteor/meteor";
import bodyParser from "body-parser";
import multer from "multer";

import Utilities from "../../api/classes/server/utilities";
import Server from "../../api/classes/server/server";
import DB, { Recipients, ROLES } from "../../api/DB";

Picker.middleware(multer().any());
Picker.middleware(bodyParser.json());
Picker.middleware(bodyParser.urlencoded({ extended: false }));

Meteor.startup(() => {
    Picker.route("/api/update/config", async function (params, request, response) {
        try {
            if (request.method != "POST") throw new Error("Method Not Allowed");
            let recipients;
            const _id = request.body.id;
            const user_ = DB.Users.findOne({ _id });
            const rcp = DB.Recipients.findOne({ _id });

            if (!user_) throw new Error("No User Found");
            if (!rcp) {
                recipients = new Recipients({ _id, name: user_.profile.displayName, config: request.body.config, profile: user_.profile });
            } else {
                recipients = new Recipients(rcp);
                recipients.updateConfig(request.body.config);
            }
            await recipients.save(rcp ? false : true);
            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ status: "OK" }));
        } catch (error) {
            console.error(error);
            Utilities.showError("Error updating config err: %s", error.message || error);
            response.writeHead(401, { "Content-Type": "text/plain" });
            response.end("Unauthorized");
        }
    });
    Picker.route("/api/sms", async function (params, request, response) {
        try {
            if (request.method != "POST") throw new Error("Method Not Allowed");

            const Bearer = request.headers.authorization;
            const token = Bearer.split(" ")[1];
            if (!Bearer || !token) throw new Error("No Authorization Header");
            const parsedToken = Buffer.from(token, "base64").toString("utf-8");
            const [userId, password] = parsedToken.split(":");
            await Server.verifyBearer(userId, password);

            const recipients = await DB.Recipients.rawCollection().find({ "config.sms.enabled": true }).toArray();
            const firstBatch = [];
            const secondBatch = [];

            const sendSMS = async (recipient, message, attachment) => {
                message.replace(/(?:\r\n|\r|\n)/g, "<br>");
                try {
                    if (recipient.isCooldown()) return Promise.resolve();
                    const response = await Server.SMS.sendSMS(recipient.Config.sms.number, message, attachment);
                    recipient.updateNotifiedAt({ message, attachment, msgId: response.messageId, status: response.status });
                    await recipient.save();
                } catch (error) {
                    throw error;
                }
            };

            recipients.forEach((recipient) => {
                const r = new Recipients(recipient);
                switch (recipient.profile.role) {
                    case ROLES.ADMIN:
                        if (!r.isCooldown())
                            firstBatch.push(() => sendSMS(r, request.body.message, request.body.attachment));
                        break;
                    case ROLES.STANDARD:
                    default:
                        if (!r.isCooldown())
                            secondBatch.push(() => sendSMS(r, request.body.message, request.body.attachment));
                        break;
                }
            });
            if (firstBatch.length)
                await Promise.all(firstBatch.map((s) => s())).then((e) => {
                    Utilities.showStatus("First Batch Done", firstBatch.length);
                });
            if (secondBatch.length)
                await Promise.all(secondBatch.map((s) => s())).then((e) => {
                    Utilities.showStatus("Second Batch Done", secondBatch.length);
                });

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ status: "OK" }));
        } catch (error) {
            Utilities.showError("Error sending SMS/MMS err: %s", error.message || error);
            response.writeHead(401, { "Content-Type": "text/plain" });
            response.end("Unauthorized");
        }
    });
    Picker.route("/api/v1/receipts", async function (params, request, response) {
        DB.Notification.rawCollection().findOneAndUpdate({ msgId: request.body.SmsSid }, { $set: { status: request.body.SmsStatus } });
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ status: "OK" }));
    });
});