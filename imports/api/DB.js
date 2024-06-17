import { Meteor } from "meteor/meteor";
import { Mongo } from "meteor/mongo";
import moment from "moment";

const createCollection = (name, option = { idGeneration: "MONGO" }) => {
    return new Mongo.Collection(name, option);
};

export const rawMongoID = MongoInternals.NpmModule.ObjectID;
export const MongoID = Mongo.ObjectID;

export const INDEXES = {
    Notification: [{ key: { createdAt: -1 } }],
    Recipients: [{ key: { createdAt: -1 } }, { key: { userId: 1 } }],
};

const DB = {
    Notification: (() => createCollection("notification"))(),
    Recipients: (() => createCollection("recipients"))(),
    Users: Meteor.users,
};

export default DB;


export const ROLES = {
    STANDARD: 0x1,
    ADMIN: 0x2,
};

class Notifications {
    constructor(id, createdAt, message, attachment, msgId = "", status = "queued") {
        this.userId = id;
        this.message = message;
        this.attachment = attachment;
        this.createdAt = createdAt;
        this.msgId = msgId;
        this.status = status;
    }
    save() {
        const update = DB.Notification.insert(this);
        if (update && update._str) return update._str;
        return update;
    }
}

export class Recipients {
    #config = {
        sms: { enabled: true, number: "" },
        email: { enabled: true, address: "" },
        discord: { enabled: true, url: "" },
    };
    #profile = {
        role: ROLES.STANDARD,
        notifiedAt: null,
    };
    constructor(data) {
        this._id = data._id;
        this.name = data.name;
        this.updateConfig(data.config);
        this.updateProfile(data.profile);
    }
    get Config() {
        return this.#config;
    }
    get Profile() {
        return this.#profile;
    }
    toObject() {
        return {
            name: this.name,
            config: this.#config,
            profile: this.#profile,
        };
    }
    updateProfile(role) {
        for (let key in role) {
            if (this.#profile.hasOwnProperty(key)) {
                this.#profile[key] = role[key];
            }
        }
    }
    updateConfig(config) {
        for (let key in config) {
            if (this.#config.hasOwnProperty(key)) {
                this.#config[key] = config[key];
            }
        }
    }
    updateNotifiedAt({ message = "", attachment = [], msgId = "", status = "queued" }) {
        this.#profile.notifiedAt = moment().valueOf();
        const notification = new Notifications(this._id, this.#profile.notifiedAt, message, attachment, msgId, status);
        const lastNotifID = notification.save();
        this.#profile.lastNotifID = lastNotifID;
    }
    isCooldown() {
        if (this.#profile.notifiedAt) {
            const diff = moment().diff(this.#profile.notifiedAt, "minutes");
            return diff < 2;
        }
        return false;
    }
    async save(upsert = false) {
        try {
            const update = { ...this.toObject() };
            if (!upsert) update.updatedAt = moment().valueOf();
            else update.createdAt = moment().valueOf();
            return await DB.Recipients.rawCollection().updateOne({ _id: this._id }, { $set: update }, { upsert });
        } catch (error) {
            throw new Error(error);
        }
    }
}