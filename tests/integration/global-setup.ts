import { resetTestDatabase } from "../helpers/test-db";

// Vitest globalSetup: start every integration run from an empty, fully migrated test database.
export default async function setup() {
  await resetTestDatabase();
}
