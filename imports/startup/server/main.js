import { Meteor } from "meteor/meteor";

import Server from "../../api/classes/server/server";
import utilities from "../../api/classes/server/utilities";

Meteor.startup(() => {
    Server.startup();
});