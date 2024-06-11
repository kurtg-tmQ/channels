import { Meteor } from "meteor/meteor";
import bodyParser from "body-parser";

import multer from "multer";
import path from "path";
import fs from "fs";

import Utilities from "../../api/classes/server/utilities";
import Server from "../../api/classes/server/server";
import Path from "../../api/classes/server/Path";
import DB, { Recipients, ROLES } from "../../api/DB";

Picker.middleware(multer().any());
Picker.middleware(bodyParser.json());
Picker.middleware(bodyParser.urlencoded({ extended: false }));



Meteor.startup(() => {
    Picker.route("/api/sms", async function (params, request, response) {
        try {
            if (request.method != "POST") throw new Error("Method Not Allowed");

            const Bearer = request.headers.authorization;
            const token = Bearer.split(" ")[1];
            if (!Bearer || !token) throw new Error("No Authorization Header");
            const parsedToken = Buffer.from(token, "base64").toString("utf-8");
            const [userId, password] = parsedToken.split(":");
            await Server.verifyBearer(userId, password);
            console.log("Request", request.body);

            const recipients = await DB.Recipients.rawCollection().find({ "config.sms.enabled": true }).toArray();
            const firstBatch = [];
            const secondBatch = [];

            const sendSMS = async (data, message, attachment) => {
                message.replace(/(?:\r\n|\r|\n)/g, "<br>");
                try {
                    const recipient = new Recipients(data);
                    await Server.SMS.sendSMS(recipient.Config.sms.number, message, attachment);
                    recipient.updateNotifiedAt();
                    await recipient.save();
                } catch (error) {
                    console.error(error);
                    Utilities.showError("Error sending SMS/MMS err: %s", error.message || error);
                }

            };

            recipients.forEach((recipient) => {
                switch (recipient.profile.role) {
                    case ROLES.ADMIN:
                        firstBatch.push(() => sendSMS(recipient, request.body.message, request.body.attachment));
                        break;
                    case ROLES.STANDARD:
                    default:
                        secondBatch.push(() => sendSMS(recipient, request.body.message, request.body.attachment));
                        break;
                }
            });
            await Promise.all(firstBatch.map((s) => s())).then((resutl) => {
                console.log("First Batch Done", resutl);
            });
            await Promise.all(secondBatch.map((s) => s())).then((resutl) => {
                console.log("Second Batch Done", resutl);
            });

            response.writeHead(200, { "Content-Type": "application/json" });
            response.end(JSON.stringify({ status: "OK" }));
        } catch (error) {
            console.error(error);
            Utilities.showError("Error sending SMS/MMS err: %s", error.message || error);
            response.writeHead(401, { "Content-Type": "text/plain" });
            response.end("Unauthorized");
        }
    });
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
});