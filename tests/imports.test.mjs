import { importEntriesFromFile } from "../src/features/importers.js";

function createFile(name, content) {
  return {
    name,
    async text() {
      return content;
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const file = createFile("vault.csv", "name,url,username,password\nExample,https://example.com,alice,secret");
const rows = await importEntriesFromFile(file);
assert(rows.length === 1, "csv import should return one row");
assert(rows[0].title === "Example", "csv title should map");
