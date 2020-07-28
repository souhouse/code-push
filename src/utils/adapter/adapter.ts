import { UserProfile, ApiToken, ApiTokensGetResponse } from "./adapter-types";
import * as sdk_types from "../../script/types";

export function toLegacyAccount(profile: UserProfile): sdk_types.Account {
    return {
        name: profile.name,
        email: profile.email,
        linkedProviders: []
    };
}

export function toLegacyAccessKey(apiToken: ApiToken): sdk_types.AccessKey {
    const accessKey: sdk_types.AccessKey = {
        createdTime: Date.parse(apiToken.created_at),
        expires: Date.parse('9999-12-31T23:59:59'), // never,
        key: apiToken.api_token,
        name: apiToken.description
    };

    return accessKey;
}

export function toLegacyAccessKeyList(apiTokens: ApiTokensGetResponse[]): sdk_types.AccessKey[] {
    const accessKeyList: sdk_types.AccessKey[] = apiTokens.map((apiToken) => {
        const accessKey: sdk_types.AccessKey = {
            createdTime: Date.parse(apiToken.created_at),
            expires: Date.parse('9999-12-31T23:59:59'), // never,
            name: apiToken.description,
        };

        return accessKey;
    });

    accessKeyList.sort((first: sdk_types.AccessKey, second: sdk_types.AccessKey) => {
        const firstTime = first.createdTime || 0;
        const secondTime = second.createdTime || 0;
        return firstTime - secondTime;
    });

    return accessKeyList;
}

function parseApiAppName(
    apiAppName: string,
    callingUserName: string
): {
    appOwner: string;
    appName: string;
} {
    // If the separating ~~ is not included, assume the owner is the calling user and only the app name is provided
    if (!apiAppName.includes('~~')) {
        return {
            appOwner: callingUserName,
            appName: apiAppName
        };
    }
    const [appOwner, appName] = apiAppName.split('~~');

    return { appOwner, appName };
}
