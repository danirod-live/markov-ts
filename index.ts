import {
  Client,
  Intents,
  Message,
  PartialMessage,
  Snowflake,
} from "discord.js";
import { Database, open } from "sqlite";
import * as sqlite3 from "sqlite3";

const MarkovGen = require("markov-generator");

const SETUP_SCRIPT = `
    CREATE TABLE IF NOT EXISTS "chains" (
        "event_id"	VARCHAR(48) NOT NULL,
        "chain_id"	VARCHAR(48),
        "content"	TEXT,
        PRIMARY KEY("event_id")
    );
    CREATE INDEX IF NOT EXISTS "user_id" ON "chains" (
        "chain_id"	ASC
    );
`;

interface Chain {
  event_id: string;
  chain_id: string;
  content: string;
}

async function openDatabase(): Promise<Database> {
  const database = await open({
    filename: "chains.sqlite",
    driver: sqlite3.Database,
  });
  await database.run(SETUP_SCRIPT);
  return database;
}

async function insertMessage(database: Database, msg: Message): Promise<void> {
  const chain: Chain = {
    event_id: msg.id,
    chain_id: msg.author.id,
    content: msg.cleanContent,
  };
  await database.run(
    `INSERT INTO chains(event_id, chain_id, content) VALUES (?, ?, ?)`,
    [chain.event_id, chain.chain_id, chain.content]
  );
}

async function deleteMessage(
  database: Database,
  msg: PartialMessage | Message
): Promise<void> {
  await database.run(`DELETE FROM chains WHERE event_id = ?`, [msg.id]);
}

async function generateChain(
  database: Database,
  author: Snowflake
): Promise<string> {
  const content = await database.all(
    `SELECT content FROM chains WHERE chain_id = ?`,
    author
  );
  const messages = content.map((c) => c.content);
  const chain = new MarkovGen({
    input: messages,
    minLength: 10,
  });
  return chain.makeChain();
}

if (!process.env.BOT_TOKEN) {
  console.error("Missing config");
  process.exit(1);
}
const token: string = process.env.BOT_TOKEN;

const client = new Client({
  partials: ["MESSAGE", "REACTION"],
  intents:
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS |
    Intents.FLAGS.GUILD_MESSAGES |
    Intents.FLAGS.GUILDS,
});

client.on("ready", () => {
  console.log("Bot is online");
});

openDatabase().then((db) => {
  client.on("messageCreate", async (msg) => {
    console.log("Registramos un mensaje nuevo");
    await insertMessage(db, msg);
  });
  client.on("messageDelete", async (msg) => {
    console.log("Eliminamos un mensaje eliminado");
    await deleteMessage(db, msg);
  });
  client.on("interactionCreate", async (i) => {
    if (i.isApplicationCommand() && i.commandName === "markov") {
      await i.deferReply();
      try {
        const param = i.options.get("persona", false);
        const target = param ? String(param.value) : i.user.id;
        console.log(target);
        const markov = await generateChain(db, target);
        i.followUp(markov);
      } catch (e) {
        const messages = [
          "[El bot te mira con desaprobación]",
          "[El bot se te queda mirando sin decir nada]",
          "[El bot mira tus manos, pero finalmente no dice nada]",
          "[La IA del bot te mira como preguntándose quién eres]",
        ];
        const message = messages[Math.floor(Math.random() * messages.length)];
        i.followUp(message);
      }
    }
  });
  client.login(token);
});

process.on("SIGINT", () => {
  client.destroy();
});
process.on("SIGTERM", () => {
  client.destroy();
});
