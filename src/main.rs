mod markov;
mod schema;
use markov::Markov;
use schema::Schema;
use serenity::async_trait;
use serenity::model::application::interaction::application_command::CommandDataOptionValue;
use serenity::model::application::interaction::{Interaction, InteractionResponseType};
use serenity::model::channel::Message;
use serenity::prelude::*;
use std::env;

struct Handler;

fn create_schema() -> Result<Schema, &'static str> {
    if let Ok(schema) = Schema::new("chains.sqlite") {
        return Ok(schema);
    }
    Err("Cannot open schema")
}

#[async_trait]
impl EventHandler for Handler {
    async fn message(&self, ctx: Context, msg: Message) {
        if msg.author.bot {
            println!("Es un puto bot");
        } else {
            let msg_id = msg.id.to_string();
            let user_id = msg.author.id.to_string();
            let content = msg.content;
            println!(
                "Inserto mensaje {} del user {} con id {}",
                content, user_id, msg_id
            );

            let schema = create_schema().unwrap();
            schema.insert(&msg_id, &user_id, &content).unwrap();
        }
    }

    async fn interaction_create(&self, ctx: Context, i: Interaction) {
        if let Interaction::ApplicationCommand(aci) = i {
            if aci.data.name != "markov" {
                println!("WTF, this is not markov");
                return;
            }

            let chain_id = match aci.data.options.get(0) {
                None => None,
                Some(param) => {
                    let parameter = param.resolved.as_ref();
                    if let Some(CommandDataOptionValue::User(user, _)) = parameter {
                        Some(user.id)
                    } else {
                        None
                    }
                }
            };

            let schema = create_schema().unwrap();
            let chain = match chain_id {
                None => schema.all().unwrap(),
                Some(id) => schema.chain(&id.to_string()).unwrap(),
            };

            let mut markov = Markov::new();
            chain.iter().for_each(|ch| markov.add_string(&ch));
            let generated = markov.generate(20);

            aci.create_interaction_response(&ctx.http, |response| {
                response
                    .kind(InteractionResponseType::ChannelMessageWithSource)
                    .interaction_response_data(|message| message.content(generated))
            })
            .await;
        }
    }
}

#[tokio::main]
async fn main() {
    let token = env::var("BOT_TOKEN").expect("Expected a token in the environment");

    let intents = GatewayIntents::GUILD_MESSAGES
        | GatewayIntents::DIRECT_MESSAGES
        | GatewayIntents::MESSAGE_CONTENT;

    let mut client = Client::builder(&token, intents)
        .event_handler(Handler)
        .await
        .expect("Err creating client");

    if let Err(why) = client.start().await {
        println!("Client error: {:?}", why);
    }
}
