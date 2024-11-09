//      ___                            _    ___        _
//    / __> _ _  ___  ___  ___  _ _ _| |_ | . > ___ _| |_
//     \__ \| | || . \| . \/ . \| '_> | |  | . \/ . \ | |
//     <___/`___||  _/|  _/\___/|_|   |_|  |___/\___/ |_|
//                |_|  |_|
//
//           SupportBot created by Emerald Services
//           Installed with MIT License
//
//           Discord Support: https://emeraldsrv.dev/discord
//           Community Resources: https://emeraldsrv.dev/resources

const fs = require("fs");

const yaml = require("js-yaml");
const supportbot = yaml.load(
  fs.readFileSync("./Configs/supportbot.yml", "utf8")
);

const Client = require("./Structures/Client.js");
const client = new Client({
  intents: ['Guilds', 'GuildMembers', 'GuildMessages', 'MessageContent']
});

client.start(supportbot.General.Token);



















