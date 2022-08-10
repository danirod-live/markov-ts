use rand::prelude::*;
use rand::thread_rng;
use std::collections::HashMap;
use std::str::SplitWhitespace;

pub struct StringMarkovIterator<'a> {
    iter: SplitWhitespace<'a>,
    last: Option<&'a str>,
}

type MarkovResult = (String, String);

impl<'a> StringMarkovIterator<'a> {
    fn new(string: &'a str) -> Self {
        Self {
            iter: string.split_whitespace(),
            last: None,
        }
    }

    fn read_first(&mut self) -> Option<MarkovResult> {
        self.last = self.iter.next();
        self.read_next()
    }

    fn read_next(&mut self) -> Option<MarkovResult> {
        let next_word = self.iter.next();
        if next_word.is_none() {
            return None;
        }

        let returned_tuple = (
            self.last.unwrap().to_string(),
            next_word.unwrap().to_string(),
        );
        self.last = next_word;
        Some(returned_tuple)
    }
}

impl<'a> Iterator for StringMarkovIterator<'a> {
    type Item = MarkovResult;

    fn next(&mut self) -> Option<Self::Item> {
        match self.last {
            None => self.read_first(),
            Some(_) => self.read_next(),
        }
    }
}

pub struct Markov {
    prob: HashMap<String, Vec<String>>,
}

impl Markov {
    pub fn new() -> Self {
        Self {
            prob: HashMap::new(),
        }
    }

    pub fn add_string(&mut self, sentence: &str) {
        for (prev, next) in StringMarkovIterator::new(sentence) {
            match self.prob.get_mut(&prev) {
                None => {
                    self.prob.insert(prev, vec![next]);
                }
                Some(ref mut value) => {
                    value.push(next.clone());
                }
            }
        }
    }

    pub fn generate(&self, words: i16) -> String {
        let mut result = String::new();

        let mut rng = thread_rng();
        let starting_key = self.prob.keys().choose(&mut rng);
        if let Some(first_word) = starting_key {
            result.push_str(first_word);
            result.push_str(" ");

            let mut next_word = first_word;
            for _ in 1..words {
                let values = self.prob.get(next_word);
                if values.is_none() {
                    return result;
                }
                let picked_one = values.unwrap().choose(&mut rng);
                if picked_one.is_none() {
                    return result;
                }
                result.push_str(picked_one.unwrap());
                result.push_str(" ");
                next_word = &picked_one.unwrap();
            }
        }

        result
    }

    fn inspect(&self) {
        for (k, v) in self.prob.iter() {
            print!("{} -> [", k);
            v.iter().for_each(|i| print!("'{}' ", i));
            println!("]");
        }
    }
}
