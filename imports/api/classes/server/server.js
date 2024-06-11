import { Meteor } from 'meteor/meteor';
import yaml from "js-yaml";
import Path from './Path';
import fs from 'fs';

import DB, { INDEXES } from "../../DB";
import Utilities from './utilities';
import { SMSManager } from './sms/SmsManager';

class Server {
    #settings;
    #sms;
    constructor(settings) {
        this.#settings = settings;
        this.readConfig(Path.CONFIG + "settings.yml");

    }
    get Config() {
        return this.#settings;
    }
    /**
     * @returns {SMSManager}
     */
    get SMS() {
        return this.#sms;
    }
    /**
   * Read configuration file
   * @param {String} path
   */
    readConfig(path) {
        const merge = (old, new_) => {
            if (typeof old == "object") {
                for (let key in old) if (typeof new_[key] != "undefined") old[key] = merge(old[key], new_[key]);
                if (typeof new_ == "object") for (let key in new_) if (typeof old[key] == "undefined") old[key] = new_[key];
            } else if (old instanceof Array) {
                old.concat(new_);
            } else return new_;
            return old;
        };
        Utilities.showNotice("Reading configuration... file: %s", path);
        if (fs.existsSync(path)) {
            try {
                const doc = yaml.load(fs.readFileSync(path, "utf8"));
                this.#settings = merge(this.#settings, doc);
                Utilities.showStatus("Done reading configuration!");
            } catch (err) {
                throw new Error("Missing configuration! err: " + err.message);
            }
        } else throw new Error("Missing configuration! err: " + path + " not found");
    }
    async startup() {
        try {
            Utilities.showStatus("Starting up server...", this.Config);
            await Promise.all([this.registerIndexes()], this.initChannels());
        } catch (error) {
            Utilities.showError("Error starting up server! err: %s", error.message);
        }
    }
    async registerIndexes() {
        try {
            let list = [];
            Utilities.showNotice("Registering DB indexes...");
            for (let key in INDEXES) {
                if (!INDEXES[key].length) continue;
                for (let idx in INDEXES[key]) {
                    if (!DB[key]) {
                        Utilities.showError("Cannot create index for `%s`, not found!", key);
                        continue;
                    }
                    list.push(DB[key].rawCollection().createIndex(INDEXES[key][idx].key, INDEXES[key][idx].option));
                }
            }
            await Promise.all(list);
            return Utilities.showStatus("DB indexes are now set!");
        } catch (error) {
            return Utilities.showError("registerIndexes ", error.message || error);
        }
    }
    async verifyBearer(userId, password) {
        try {
            const user = DB.Users.findOne({ _id: userId });
            if (!user) throw new Error("No User Found");
            if (user.token !== password) throw new Error("Invalid Token");
            return user;
        } catch (error) {
            throw new Error(error);
        }
    }
    initChannels() {
        this.#sms = new SMSManager(this.Config.sms);
    }
}

export default new Server(Meteor.settings);