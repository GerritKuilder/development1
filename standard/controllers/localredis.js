/**
 * Redis, rewritten to keep connection open
 * USE THIS

a

*/
const dotenv = require('dotenv');
const path = require('path');

// Load in priority order (last wins)
// Load .env files in correct order: most generic → most specific
// First value loaded wins, so start with system-wide defaults
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });  // System-wide (development1/.env)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });     // Standard level
dotenv.config({ path: path.resolve(__dirname, '.env') });          // Controllers level (local overrides) 
//ENV


const Logger = require(`./logger.js`)("redis")

const DATAHOST = process.env.REDIS_DATA_HOST || "192.168.2.13"
const REDISPORT = process.env.REDIS_DATA_PORT || 6379;
//'test:data:artists:lidarr';
//const LIDARR_INDEX_KEY = 'collection:list:artists:lidarr';
//const BASE_PATTERN = 'collection:data:artists:*:meta:lidarr';

//id mapping
const ID_PREFIX = 'collection:ids:meta:artist:';
const ID_LOOKUP_PREFIX = 'collection:ids:lookup:';



const { createClient } = require("redis");

// Redis config
const maxRetries = 5;
const retryDelay = 5000;

const redisConfig = {
    url: `redis://${DATAHOST}:${REDISPORT}`,
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > maxRetries) {
                console.error("❌ Redis: max retries reached, terminating.");
                return false;
            }
            console.warn(`⚠️ Redis reconnect attempt #${retries}`);
            return retryDelay;
        },
    },
};

let client;

async function connect() {
    if (!client) {
        client = createClient(redisConfig);

        client.on("error", (err) => console.error("❌ Redis Error:", err));
        client.on("connect", () => console.log("✅ Redis connected"));
        client.on("reconnecting", () => console.log("🔄 Redis reconnecting..."));



        await client.connect();
    }
    return client;
}




async function saveWanted(inAlbums) {
    const thisClient = await connect();
    for (inAlbum of inAlbums) {
        const saved = await thisClient.set(`music:lidarr:albums:wanted:${inAlbum.id}`, JSON.stringify(inAlbum), (err, reply) => {
            if (err) {
                console.error(err);
                //Logger.error("error in sending message " + err)
            } else {
                console.log('Item enqueued:', item);
                //Logger.verbose("Message Sent ")
            }
        });
    }
    //closeConnection()

}

// get wanted

async function getWanted() {
    const prefixToRemove = 'music:lidarr:albums:wanted:'
    const pattern = 'music:lidarr:albums:wanted'
    const thiscanConnect = await connect();
    const thisClient = await connect();
    console.log(pattern)
    const keys = await thisClient.keys(pattern)
    //console.log(keys)

    const values = await thisClient.mGet(keys)
    const data = values.map(reply => JSON.parse(reply))


    const keyValuePairs = keys.map((key, index) => {
        const trimmedKey = key.replace(prefixToRemove, ""); // Remove the prefix
        let parsedValue;

        try {
            parsedValue = JSON.parse(values[index]); // Parse JSON values
        } catch (error) {
            parsedValue = values[index]; // Keep original if parsing fails
        }

        return { key: trimmedKey, value: parsedValue };
    });


    return keyValuePairs;


}

//save albums
async function saveAlbum(inLibrary, inRelease, inReleaseGroup, inAlbum) {
    const thisClient = await connect();
    thisClient.set(`jellyfin:${inLibrary}:release:${inRelease}`, JSON.stringify(inAlbum), (err, reply) => {
        if (err) {
            console.error(err);
            //Logger.error("error in sending message " + err)
        } else {
            console.log('Item enqueued:', item);
            //Logger.verbose("Message Sent ")
        }
    });
    //release group
    thisClient.set(`jellyfin:${inLibrary}:releasegroup:${inReleaseGroup}`, JSON.stringify(inAlbum), (err, reply) => {
        if (err) {
            console.error(err);
            //Logger.error("error in sending message " + err)
        } else {
            console.log('Item enqueued:', item);
            //Logger.verbose("Message Sent ")
        }
    });

}
///

function setNested(obj, pathParts, value) {
    let current = obj;
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (i === pathParts.length - 1) {
            current[part] = value;
        } else {
            if (!current[part]) current[part] = {};
            current = current[part];
        }
    }
}
//used to get an artist with all meta/releases 
async function fetchNestedData(base) {
    const thisClient = await connect();

    const result = {};

    let cursor = 0;
    do {
        const reply = await thisClient.scan(cursor, { MATCH: `${base}*`, COUNT: 100 });
        cursor = Number(reply.cursor);

        for (const key of reply.keys) {
            const type = await thisClient.type(key);
            let value;

            switch (type) {
                case 'string':
                    value = await thisClient.get(key);
                    break;
                case 'hash':
                    value = await thisClient.hGetAll(key);
                    break;
                case 'list':
                    value = await thisClient.lRange(key, 0, -1);
                    break;
                case 'set':
                    value = await thisClient.sMembers(key);
                    break;
                case 'zset':
                    value = await thisClient.zRangeWithScores(key, 0, -1);
                    break;
                default:
                    value = null;
            }

            // Remove the baseKey and split by colon
            //const pathParts = key.slice(base.length + 1).split(':');
            let relative = key.slice(base.length);
            if (relative.startsWith(':')) {
                relative = relative.slice(1);
            }
            const pathParts = relative ? relative.split(':') : [];
            // setNested(result, pathParts, value);
            setNested(result, pathParts, parseValue(value));
            //setNested(result, pathParts, value);
        }
    } while (cursor !== 0);
    if (Object.keys(result).length === 0) {
        return null
    }
    return result;
}

async function getAll(inPatttern) {
    const thisClient = await connect();

    const pattern = inPatttern;
    let cursor = 0;
    const keys = [];

    // SCAN loop to get all matching keys
    do {
        const reply = await thisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = Number(reply.cursor);
        keys.push(...reply.keys);
    } while (cursor !== 0);

    console.log('Matching keys:', keys);

    const data = [];

    for (const key of keys) {
        const type = await thisClient.type(key); // check key type

        let value;

        switch (type) {
            case 'string':
                value = await thisClient.get(key);
                break;
            case 'hash':
                value = await thisClient.hGetAll(key);
                break;
            case 'list':
                value = await thisClient.lRange(key, 0, -1);
                break;
            case 'set':
                value = await thisClient.sMembers(key);
                break;
            case 'zset':
                value = await thisClient.zRange(key, 0, -1, { WITHSCORES: true });
                break;
            default:
                value = null;
        }

        data.push({ key, type, value });
    }
}

//

function parseValue(value) {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch (e) {
            // not JSON, return as-is
            return value;
        }
    }
    if (Array.isArray(value)) {
        return value.map(v => parseValue(v));
    }
    if (typeof value === 'object' && value !== null) {
        const parsed = {};
        for (const k in value) {
            parsed[k] = parseValue(value[k]);
        }
        return parsed;
    }
    return value;
}




/// get all key/values

async function getAllKeysAndValues(pattern, prefixToRemove) {
    const thisClient = await connect();
    console.log(pattern)
    const keys = await thisClient.keys(pattern)
    //console.log(keys)

    const values = await thisClient.mGet(keys)
    const data = values.map(reply => JSON.parse(reply))


    const keyValuePairs = keys.map((key, index) => {
        const trimmedKey = key.replace(prefixToRemove, ""); // Remove the prefix
        let parsedValue;

        try {
            parsedValue = JSON.parse(values[index]); // Parse JSON values
        } catch (error) {
            parsedValue = values[index]; // Keep original if parsing fails
        }

        return { key: trimmedKey, value: parsedValue };
    });


    return keyValuePairs;


}


//TODO: add :* here
async function getAllKeys(pattern, prefixToRemove) {
    const thisClient = await connect();

    //console.log(pattern)
    const keys = await thisClient.keys(pattern)
    //console.log(keys)

    const values = await thisClient.mGet(keys)
    const data = values.map(reply => JSON.parse(reply))

    /*
            const keyValuePairs = keys.map((key, index) => {
                const trimmedKey = key.replace(prefixToRemove, ""); // Remove the prefix
                let parsedValue;
    
                try {
                    parsedValue = JSON.parse(values[index]); // Parse JSON values
                } catch (error) {
                    parsedValue = values[index]; // Keep original if parsing fails
                }
    
                return { key: trimmedKey, value: parsedValue };
            });
    
            await thisClient.quit(); // Close connection after use
            return keyValuePairs;
            */

    return data
}

async function getKeysOnly(inPattern, prefixToRemove) {
    console.log("Keys Only" + inPattern)
    const pattern = inPattern + "*"
    //const clean=inPattern+":"
    const thisClient = await connect();
    //console.log(pattern)
    const keys = await thisClient.keys(pattern)
    //console.log(keys)

    const cleaned = keys.map(key => key.replace(inPattern, ''));
    //const cleaned = keys.map(key => key.split(inPattern)[1]);
    //console.log(cleaned)
    return cleaned



}
// Key exists and keySave
//TODO deleteKey?

async function deleteKeys(inKey) {
    const pattern = inKey
    const thiscanConnect = await connect();
    const thisClient = await connect();
    let cursor = 0;
    const keysToDelete = [];

    do {
        const result = await thisClient.scan(cursor, {
            MATCH: pattern,
            COUNT: 100,
        });

        cursor = parseInt(result.cursor);
        keysToDelete.push(...result.keys);
    } while (cursor !== 0);

    console.log('Keys matched:', keysToDelete.length);

    if (keysToDelete.length > 0) {
        //const deleteCount = await thisClient.del(...keysToDelete);
        for (deleteKey of keysToDelete) {
            console.log("Deleting Key: " + deleteKey)
            await thisClient.del(deleteKey);

        }
        //console.log(`Deleted ${deleteCount} of ${keysToDelete.length} keys.`);
    } else {
        console.log('No keys matched.');
    }

    return

}

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function deleteKey(key) {
    const thisClient = await connect();
    try {
        const result = await thisClient.del(key);
        return result > 0; // 1 if deleted, 0 if key didn't exist
    } catch (err) {
        console.error("Error deleting key:", err);
        return false;
    }
}

//all keyActions also need to add keysActions
async function keyDelete(key) {
    const thisClient = await connect();
    try {
        const result = await thisClient.del(key);
        return result > 0; // 1 if deleted, 0 if key didn't exist
    } catch (err) {
        console.error("Error deleting key:", err);
        return false;
    }
}



async function keyExists(inKey) {
    const thisClient = await connect();

    const key = inKey; // Construct the full key
    const exists = await thisClient.exists(key); // Check if the key exists
    //console.log(exists)

    if (exists === 1) {
        // Key exists, fetch its value
        const value = await thisClient.get(key); // Get the value associated with the key

        let parsedValue;
        try {
            parsedValue = JSON.parse(value); // Parse the value as JSON
        } catch (error) {
            parsedValue = value; // If not JSON, return the original value
        }

        return parsedValue; // Return the parsed JSON value
    } else {

        return null; // Return null if key does not exist
    }
}

async function keySave(inKey, inValue, inExpire) {
    inValue.updated_at=Date.now()
    const thisClient = await connect();
    thisClient.set(inKey, JSON.stringify(inValue), (err, reply) => {
        if (err) {
            console.error(err);
            Logger.error("error in sending message " + err)
            return false
        } else {
            console.log('Item saved:')
            //return true
            //Logger.verbose("Message Sent ")
        }

    })
    if (inExpire) {
        thisClient.expire(inKey, inExpire)
    }
    //console.log("item saved")
    return true
}



// 




/**}
 * with the config as above 
 * 
 * @returns 
 */
async function canConnect() {
    var retries = 5
    try {
        thisClient = createClient(redisConfig)
        thisClient.on('error', (err) => {
            retries--
            if (retries == 1) {
                Logger.error(`Redis Error Final ${DATAHOST}:${REDISPORT}:  ${err}`)
                //logger.error
                return false
            }
        });
        await thisClient.connect();
        if (thisClient.isReady) {
            //console.log("Client is Ready")
            //Logger.verbose("Client is Ready")
            return true
        } else {
            console.log("client is not ready")
            Logger.error("Redis connection failed")
            thisClient.quit()
            return false
        }
    } catch (err) {
        if (err.code === 'ECONNREFUSED') {
            console.error('Connection refused. Unable to connect to Redis.');
            Logger.error(`Connection refused. Unable to connect to Redis. ${DATAHOST}:${REDISPORT}:  ${err}`)
            //logger fatal
        } else {
            console.error('An error occurred during connection:', err);
            Logger.error(`An error occurred during connection: ${DATAHOST}:${REDISPORT}:  ${err}`)

        }
        return false;
    }
}

async function Exconnect() {
    result = await canConnect()
    return result
}



/**
 * fromqueue/toqueue
 */
async function toQueue(inQueue, inItem) {
    const thisClient = await connect();
    thisClient.rPush(`queue:${inQueue}`, JSON.stringify(inItem), (err, reply) => {
        if (err) {
            console.error(err);
            Logger.error("error in sending message " + err)
        } else {
            console.log('Item enqueued:', item);
            Logger.verbose("Message Sent ")
        }

    });

}

/**
 * lpop=left pop/ rpop pop from right
 * rpop for news reader does not get the elements in the right time secquence
 * @param {*} outQueue 
 * @returns 
 */
async function fromQueue(outQueue) {
    const thisClient = await connect();
    //rpop or lpop
    const result = await thisClient.lPop(`queue:${outQueue}`)
    return (JSON.parse(result))

}

// get/update artist list

async function rebuildLidarrIndex(client) {
    const thisClient = await connect();
    await thisClient.del(LIDARR_INDEX_KEY);

    let cursor = 0;
    do {
        const reply = await thisClient.scan(cursor, { MATCH: BASE_PATTERN, COUNT: 500 });
        cursor = Number(reply.cursor);

        if (reply.keys.length > 0) {
            const artistIds = reply.keys.map(key => key.split(':')[3]); // extract UUID
            if (artistIds.length > 0) {
                await thisClient.sAdd(LIDARR_INDEX_KEY, artistIds);
            }
        }
    } while (cursor !== 0);

    console.log('✅ Lidarr index rebuilt');

}

// ⚡ Fetch all Lidarr artists using the index
async function getAllLidarrArtists(client) {
    const thisClient = await connect();

    const artistIds = await thisClient.sMembers('collection:list:artists:lidarr');
    if (artistIds.length === 0) return {};

    const pipeline = thisClient.multi();
    for (const id of artistIds) {
        pipeline.get(`collection:data:artists:${id}:meta:lidarr`);
    }

    const results = await pipeline.exec();

    //const output = {};

    const output = [];
    for (let i = 0; i < artistIds.length; i++) {
        const raw = results[i];
        if (!raw) continue;

        try {
            const artist = JSON.parse(raw);

            // Remove unwanted fields
            const FIELDS_TO_REMOVE = ['links', 'lastAlbum', 'overview']
            for (const field of FIELDS_TO_REMOVE) {
                delete artist[field];
            }

            output.push(artist);
        } catch (e) {
            // fallback: skip invalid JSON
            continue;
        }
    }

    return output;
}

/*
artistIds.forEach((id, i) => {
  try {
    output[id] = results[i] ? JSON.parse(results[i]) : null;
  } catch (e) {
    output[id] = results[i]; // fallback: raw string
  }
});
 
return output;
*/

//delete the tree:
//import { createClient } from "redis";

async function deleteTree(prefix) {
    //const pattern = `${prefix}:*`;
    const thisClient = await connect();

    const deletedKeys = [];
    let cursor = "0";
    let iteration = 0;

    try {
        do {
            iteration++;

            const { cursor: nextCursor, keys } = await thisClient.scan(cursor, {
                MATCH: `${prefix}:*`,
                COUNT: 1000,
            });

            if (keys.length > 0) {
                await thisClient.del(keys);
                deletedKeys.push(...keys);
            }

            cursor = nextCursor;

            // Safety guard in case something goes wrong
            if (iteration > 10_000) {
                console.warn("Breaking out of SCAN loop after too many iterations");
                break;
            }
        } while (cursor !== "0");

        console.log(`✅ Deleted ${deletedKeys.length} keys under prefix: ${prefix}`);
        return deletedKeys;
    } finally {

    }
}

// Example usage:
//deleteTree("collection:data:artists:");

//import { createClient } from "redis";

async function deleteTreeStream(prefix) {
    const thisClient = await connect();
    const deletedKeys = [];
    try {
        for await (const key of thisClient.scanIterator({
            MATCH: `${prefix}*`,
            COUNT: 1000,
        })) {
            await thisClient.del(key);
            deletedKeys.push(key);
            console.log(`Deleted key: ${key}`);
        }
        console.log(`✅ Finished. Total deleted: ${deletedKeys.length} keys under prefix: ${prefix}`);
        return deletedKeys;
    } finally {

    }
}

/**
 * 
 * id mapping


 */





/**
 * Store mapping between MusicBrainz ID and a service ID
 */
async function storeId(mbrainzId, serviceId, serviceName) {
const client = await connect();

  const artistKey = `${ID_PREFIX}${mbrainzId}`;
  const lookupKey = `${ID_LOOKUP_PREFIX}${serviceName}:${serviceId}`;

  const pipeline = client.multi();
  pipeline.hSet(artistKey, serviceName, serviceId);
  pipeline.set(lookupKey, mbrainzId);
  await pipeline.exec();
}

/**
 * Get a specific service ID for a MusicBrainz ID
 */
async function getServiceId(mbrainzId, serviceName) {
const client = await connect();
  const key = `${ID_PREFIX}${mbrainzId}`;
  return await client.hGet(key, serviceName);
}

/**
 * Get all services linked to a MusicBrainz ID
 */
async function getAllServices(mbrainzId) {
const client = await connect();
  const key = `${ID_PREFIX}${mbrainzId}`;
  return await client.hGetAll(key);
}

/**
 * Get the MusicBrainz ID for a given service + serviceId
 */
async function getMbrainzIdByServiceId(serviceName, serviceId) {
const client = await connect();
  const key = `${ID_LOOKUP_PREFIX}${serviceName}:${serviceId}`;
  return await client.get(key);
}

async function removeId(mbrainzId) {
const client = await connect();
  const artistKey = `${ID_PREFIX}${mbrainzId}`;

  // Get all linked services first
  const services = await client.hGetAll(artistKey);
  if (!services || Object.keys(services).length === 0) return;

  const pipeline = client.multi();

  // Remove reverse lookup entries for each service
  for (const [serviceName, serviceId] of Object.entries(services)) {
    const lookupKey = `${ID_LOOKUP_PREFIX}${serviceName}:${serviceId}`;
    pipeline.del(lookupKey);
  }

  // Finally, delete the main artist hash
  pipeline.del(artistKey);

  await pipeline.exec();
}

module.exports = { 
    getAll, canConnect, toQueue, fromQueue, getAllKeysAndValues, getAllKeys, getKeysOnly, deleteKey, 
    keyExists, keySave, deleteKeys, 
 /*     storeId, deleteTree, deleteTreeStream, rebuildLidarrIndex, 
  removeId,
  fetchNestedData, getAllLidarrArtists, 
  getServiceId,
  getAllServices,
  getMbrainzIdByServiceId, saveWanted, getWanted, saveAlbum,*/ };