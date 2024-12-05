#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { MongoClient, Db, IndexSpecification } from "mongodb";

type RecordWithCollection = Record<string, unknown> & {
  collection: string;
};

interface FindParams extends RecordWithCollection {
  filter?: Record<string, unknown>;
  limit?: number;
  projection?: Record<string, unknown>;
}

interface AggregateParams extends RecordWithCollection {
  pipeline: Record<string, unknown>[];
  limit?: number;
}

interface DistinctParams extends RecordWithCollection {
  field: string;
  filter?: Record<string, unknown>;
}

interface CountParams extends RecordWithCollection {
  filter?: Record<string, unknown>;
}

interface InsertOneParams extends RecordWithCollection {
  document: Record<string, unknown>;
}

interface UpdateOneParams extends RecordWithCollection {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
}

interface DeleteOneParams extends RecordWithCollection {
  filter: Record<string, unknown>;
}

interface CreateIndexParams extends RecordWithCollection {
  indexSpec: IndexSpecification;
}

interface DropIndexParams extends RecordWithCollection {
  indexName: string;
}

function validateFindParams(args: Record<string, unknown>): args is FindParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Collection name must be a string, got ${typeof args.collection}`
    );
  }
  return true;
}

function validateAggregateParams(
  args: Record<string, unknown>
): args is AggregateParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Collection name must be a string, got ${typeof args.collection}`
    );
  }
  if (!Array.isArray(args.pipeline)) {
    throw new McpError(ErrorCode.InvalidRequest, "Pipeline must be an array");
  }
  return true;
}

function validateDistinctParams(
  args: Record<string, unknown>
): args is DistinctParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Collection name must be a string, got ${typeof args.collection}`
    );
  }
  if (typeof args.field !== "string") {
    throw new McpError(ErrorCode.InvalidRequest, "Field must be a string");
  }
  return true;
}

function validateCountParams(
  args: Record<string, unknown>
): args is CountParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Collection name must be a string, got ${typeof args.collection}`
    );
  }
  return true;
}

function validateInsertOneParams(
  args: Record<string, unknown>
): args is InsertOneParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Collection name must be a string"
    );
  }
  if (!args.document || typeof args.document !== "object") {
    throw new McpError(ErrorCode.InvalidRequest, "Document must be an object");
  }
  return true;
}

function validateUpdateOneParams(
  args: Record<string, unknown>
): args is UpdateOneParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Collection name must be a string"
    );
  }
  if (!args.filter || typeof args.filter !== "object") {
    throw new McpError(ErrorCode.InvalidRequest, "Filter must be an object");
  }
  if (!args.update || typeof args.update !== "object") {
    throw new McpError(ErrorCode.InvalidRequest, "Update must be an object");
  }
  return true;
}

function validateDeleteOneParams(
  args: Record<string, unknown>
): args is DeleteOneParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Collection name must be a string"
    );
  }
  if (!args.filter || typeof args.filter !== "object") {
    throw new McpError(ErrorCode.InvalidRequest, "Filter must be an object");
  }
  return true;
}

function validateCreateIndexParams(
  args: Record<string, unknown>
): args is CreateIndexParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Collection name must be a string"
    );
  }
  if (!args.indexSpec || typeof args.indexSpec !== "object") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Index specification must be an object"
    );
  }
  return true;
}

function validateDropIndexParams(
  args: Record<string, unknown>
): args is DropIndexParams {
  if (typeof args.collection !== "string") {
    throw new McpError(
      ErrorCode.InvalidRequest,
      "Collection name must be a string"
    );
  }
  if (typeof args.indexName !== "string") {
    throw new McpError(ErrorCode.InvalidRequest, "Index name must be a string");
  }
  return true;
}

const server = new Server(
  {
    name: "mongodb-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Please provide a MongoDB connection URL");
  process.exit(1);
}

const databaseUrl = args[0];
const resourceBaseUrl = new URL(databaseUrl);

let client: MongoClient;
let db: Db;

async function connectToMongoDB() {
  try {
    client = new MongoClient(databaseUrl);
    await client.connect();
    const dbName = resourceBaseUrl.pathname.split("/")[1] || "test";
    console.error(`Connecting to database: ${dbName}`);
    db = client.db(dbName);
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

async function getAvailableCollections() {
  try {
    const collections = await db.listCollections().toArray();
    console.error(
      `Available collections: ${collections.map((c) => c.name).join(", ")}`
    );
    return collections;
  } catch (error) {
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to list collections: ${error.message}`
    );
  }
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "listCollections",
        description: "List all available collections in the database",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "find",
        description:
          "Query documents in a collection using MongoDB query syntax",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection to query",
            },
            filter: {
              type: "object",
              description: "MongoDB query filter",
              default: {},
            },
            limit: {
              type: "number",
              description: "Maximum documents to return",
              default: 10,
              minimum: 1,
              maximum: 1000,
            },
            projection: {
              type: "object",
              description: "Fields to include/exclude",
              default: {},
            },
          },
          required: ["collection"],
        },
      },
      {
        name: "createIndex",
        description: "Create a new index on a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
            indexSpec: {
              type: "object",
              description:
                "Index specification (e.g., { field: 1 } for ascending index)",
            },
          },
          required: ["collection", "indexSpec"],
        },
      },
      {
        name: "dropIndex",
        description: "Drop an index from a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
            indexName: {
              type: "string",
              description: "Name of the index to drop",
            },
          },
          required: ["collection", "indexName"],
        },
      },
      {
        name: "indexes",
        description: "List indexes for a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
          },
          required: ["collection"],
        },
      },
      {
        name: "insertOne",
        description: "Insert a single document into a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
            document: { type: "object", description: "Document to insert" },
          },
          required: ["collection", "document"],
        },
      },
      {
        name: "updateOne",
        description: "Update a single document in a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
            filter: {
              type: "object",
              description: "Filter to identify document",
            },
            update: {
              type: "object",
              description: "Update operations to apply",
            },
          },
          required: ["collection", "filter", "update"],
        },
      },
      {
        name: "deleteOne",
        description: "Delete a single document from a collection",
        inputSchema: {
          type: "object",
          properties: {
            collection: {
              type: "string",
              description: "Name of the collection",
            },
            filter: {
              type: "object",
              description: "Filter to identify document",
            },
          },
          required: ["collection", "filter"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const args = request.params.arguments as Record<string, unknown>;
    console.error(`Received request for tool: ${request.params.name}`);
    console.error(`Arguments:`, JSON.stringify(args, null, 2));

    switch (request.params.name) {
      case "listCollections": {
        try {
          const collections = await getAvailableCollections();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  collections.map((c) => ({
                    name: c.name,
                    type: c.type,
                  })),
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to list collections: ${error.message}`
          );
        }
      }

      case "find": {
        if (!validateFindParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid find parameters"
          );
        }

        try {
          console.error(`Executing find on collection: ${args.collection}`);
          const results = await db
            .collection(args.collection)
            .find(args.filter || {})
            .project(args.projection || {})
            .limit(Math.min(args.limit || 10, 1000))
            .toArray();

          return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Invalid find operation: ${error.message}`
          );
        }
      }

      case "createIndex": {
        if (!validateCreateIndexParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid createIndex parameters"
          );
        }

        try {
          const indexName = await db
            .collection(args.collection)
            .createIndex(args.indexSpec);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ indexName }, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to create index: ${error.message}`
          );
        }
      }

      case "dropIndex": {
        if (!validateDropIndexParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid dropIndex parameters"
          );
        }

        try {
          const result = await db
            .collection(args.collection)
            .dropIndex(args.indexName);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to drop index: ${error.message}`
          );
        }
      }

      case "indexes": {
        if (!validateFindParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid indexes parameters"
          );
        }

        try {
          const indexes = await db.collection(args.collection).indexes();
          return {
            content: [{ type: "text", text: JSON.stringify(indexes, null, 2) }],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Failed to get indexes: ${error.message}`
          );
        }
      }

      case "insertOne": {
        if (!validateInsertOneParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid insertOne parameters"
          );
        }

        try {
          const result = await db
            .collection(args.collection)
            .insertOne(args.document);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    acknowledged: result.acknowledged,
                    insertedId: result.insertedId,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Insert failed: ${error.message}`
          );
        }
      }

      case "updateOne": {
        if (!validateUpdateOneParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid updateOne parameters"
          );
        }

        try {
          const result = await db
            .collection(args.collection)
            .updateOne(args.filter, args.update);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    matched: result.matchedCount,
                    modified: result.modifiedCount,
                    upsertedId: result.upsertedId,
                  },
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Update failed: ${error.message}`
          );
        }
      }

      case "deleteOne": {
        if (!validateDeleteOneParams(args)) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            "Invalid deleteOne parameters"
          );
        }

        try {
          const result = await db
            .collection(args.collection)
            .deleteOne(args.filter);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ deleted: result.deletedCount }, null, 2),
              },
            ],
            isError: false,
          };
        } catch (error) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Delete failed: ${error.message}`
          );
        }
      }

      default:
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
    }
  } catch (error) {
    console.error("Operation failed:", error);
    if (error instanceof McpError) throw error;
    throw new McpError(
      ErrorCode.InternalError,
      `Tool execution failed: ${error.message}`
    );
  }
});

async function runServer() {
  try {
    await connectToMongoDB();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MongoDB MCP server running on stdio");

    const collections = await getAvailableCollections();
    console.error("Available collections:", collections);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  try {
    await client?.close();
  } finally {
    process.exit(0);
  }
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
  process.exit(1);
});

runServer().catch(console.error);
