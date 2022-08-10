use sqlite3::{Connection, Value};
use std::result::Result;

const CREATE: &'static str = "
CREATE TABLE IF NOT EXISTS \"chains\" (
   \"event_id\" VARCHAR(48) NOT NULL,
   \"chain_id\" VARCHAR(48),
   \"content\"  TEXT,
   PRIMARY KEY(\"event_id\")
);";

const INSERT: &'static str = "INSERT INTO chains(event_id, chain_id, content) VALUES(?, ?, ?);";

const DELETE_ID: &'static str = "DELETE FROM chains WHERE event_id = ?";

const DELETE_CHAIN: &'static str = "DELETE FROM chains WHERE chain_id = ?";

const GET_CHAIN: &'static str = "SELECT content FROM chains WHERE chain_id = ?";

const GET_ALL: &'static str = "SELECT content FROM chains";

pub struct Schema {
    con: Connection,
}

impl Schema {
    pub fn new(file: &str) -> Result<Self, &'static str> {
        if let Ok(con) = sqlite3::open(file) {
            return match con.execute(self::CREATE) {
                Ok(_) => Ok(Schema { con }),
                Err(_) => Err("Cannot init schema"),
            };
        }
        Err("Cannot open")
    }

    fn run_statement(&self, sql: &str, params: &[Value]) -> Result<(), &'static str> {
        let mut cursor = match self.con.prepare(sql) {
            Ok(statement) => statement.cursor(),
            Err(_) => return Err("Cannot prepare the statement!"),
        };
        if let Err(_) = cursor.bind(params) {
            return Err("Cannot bind the statement!");
        }
        if let Err(_) = cursor.next() {
            return Err("Cannot execute!");
        }
        Ok(())
    }

    pub fn insert(&self, id: &str, chain: &str, msg: &str) -> Result<(), &'static str> {
        self.run_statement(
            self::INSERT,
            &[
                Value::String(id.to_string()),
                Value::String(chain.to_string()),
                Value::String(msg.to_string()),
            ],
        )
    }

    pub fn delete_id(&self, id: &str) -> Result<(), &'static str> {
        self.run_statement(self::DELETE_ID, &[Value::String(id.to_string())])
    }

    pub fn delete_chain(&self, chain: &str) -> Result<(), &'static str> {
        self.run_statement(self::DELETE_CHAIN, &[Value::String(chain.to_string())])
    }

    fn extract_strings(&self, mut cursor: sqlite3::Cursor) -> std::vec::Vec<String> {
        let mut strs = vec![];
        while let Some(row) = cursor.next().unwrap() {
            strs.push(row[0].as_string().unwrap().to_string());
        }
        strs
    }

    pub fn chain(&self, chain: &str) -> Result<std::vec::Vec<String>, &'static str> {
        let mut cursor = match self.con.prepare(self::GET_CHAIN) {
            Ok(stat) => stat.cursor(),
            Err(_) => return Err("Cannot prepare statement!"),
        };
        if let Err(_) = cursor.bind(&[Value::String(chain.to_string())]) {
            return Err("Cannot bind statement!");
        }
        Ok(self.extract_strings(cursor))
    }

    pub fn all(&self) -> Result<std::vec::Vec<String>, &'static str> {
        let mut cursor = match self.con.prepare(self::GET_ALL) {
            Ok(stat) => stat.cursor(),
            Err(_) => return Err("Cannot prepare statement!"),
        };
        Ok(self.extract_strings(cursor))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn it_is_empty_by_default() {
        let schema = Schema::new(":memory:").unwrap();
        let chains = schema.all().unwrap();
        assert_eq!(chains.len(), 0);
    }

    #[test]
    fn it_gets_all() {
        let schema = Schema::new(":memory:").unwrap();
        schema.insert("1234", "5678", "9012").unwrap();
        let chains = schema.all().unwrap();
        assert_eq!(chains.len(), 1);
        assert_eq!(chains[0], "9012");
    }

    #[test]
    fn it_gets_chains_for_users() {
        let schema = Schema::new(":memory:").unwrap();
        schema.insert("1234", "5678", "9012").unwrap();

        let chains = schema.chain("5678").unwrap();
        assert_eq!(chains.len(), 1);
        assert_eq!(chains[0], "9012");

        let chain_empty = schema.chain("x").unwrap();
        assert_eq!(chain_empty.len(), 0);
    }

    #[test]
    fn it_deletes_by_id() {
        let schema = Schema::new(":memory:").unwrap();
        schema.insert("1234", "5678", "9012").unwrap();
        schema.delete_id("1234").unwrap();
        let chains = schema.all().unwrap();
        assert_eq!(chains.len(), 0);
    }

    #[test]
    fn it_deletes_by_chain() {
        let schema = Schema::new(":memory:").unwrap();
        schema.insert("1234", "5678", "9012").unwrap();
        schema.delete_chain("5678").unwrap();
        let chains = schema.all().unwrap();
        assert_eq!(chains.len(), 0);
    }
}
