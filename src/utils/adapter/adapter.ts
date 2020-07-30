import * as adapter_types from "./adapter-types";
import * as sdk_types from "../../script/types";
import RequestManager from "../request-manager";

class Adapter {
    constructor(private readonly _requestManager: RequestManager) { }

    public toLegacyAccount(profile: adapter_types.UserProfile): sdk_types.Account {
        return {
            name: profile.name,
            email: profile.email,
            linkedProviders: []
        };
    }

    public toLegacyAccessKey(apiToken: adapter_types.ApiToken): sdk_types.AccessKey {
        const accessKey: sdk_types.AccessKey = {
            createdTime: Date.parse(apiToken.created_at),
            expires: Date.parse('9999-12-31T23:59:59'), // never,
            key: apiToken.api_token,
            name: apiToken.description
        };

        return accessKey;
    }

    public toLegacyAccessKeyList(apiTokens: adapter_types.ApiTokensGetResponse[]): sdk_types.AccessKey[] {
        console.log(apiTokens);
        const accessKeyList: sdk_types.AccessKey[] = apiTokens.map((apiToken) => {
            const accessKey: sdk_types.AccessKey = {
                createdTime: Date.parse(apiToken.created_at),
                expires: Date.parse('9999-12-31T23:59:59'), // never,
                name: apiToken.description,
            };

            return accessKey;
        });

        accessKeyList.sort(
            (first: sdk_types.AccessKey, second: sdk_types.AccessKey) => {
                const firstTime = first.createdTime || 0;
                const secondTime = second.createdTime || 0;
                return firstTime - secondTime;
            }
        );

        return accessKeyList;
    }

    public async parseApiAppName(apiAppName: string): Promise<adapter_types.apiAppParams> {
        const callingUser = await this.getUser();
        // If the separating / is not included, assume the owner is the calling user and only the app name is provided
        if (!apiAppName.includes("/")) {
            return {
                appOwner: callingUser.name,
                appName: apiAppName,
            };
        }
        const [appOwner, appName] = apiAppName.split("/");
        return {
            appOwner: appOwner,
            appName: appName,
        };
    }

    public toLegacyDeployments(deployments: adapter_types.Deployment[]): sdk_types.Deployment[] {
        deployments.sort((first: adapter_types.Deployment, second: adapter_types.Deployment) => {
            return first.name.localeCompare(second.name);
        });

        return this.toLegacyRestDeployments(deployments);
    };

    public toLegacyDeployment(deployment: adapter_types.Deployment): sdk_types.Deployment {
        return this.toLegacyRestDeployment(deployment);
    };

    private toLegacyRestDeployments(apiGatewayDeployments: adapter_types.Deployment[]): sdk_types.Deployment[] {
        const deployments: sdk_types.Deployment[] = apiGatewayDeployments.map((deployment) => {
            return this.toLegacyRestDeployment(deployment, true);
        });

        return deployments;
    }

    private toLegacyRestDeployment(
        deployment: adapter_types.Deployment,
        allProperties: boolean = false
    ): sdk_types.Deployment {
        const apiGatewayPackage = this.releaseToPackage(deployment.latest_release);

        const restDeployment: sdk_types.Deployment = {
            name: deployment.name,
            key: deployment.key,
            package: apiGatewayPackage
        };

        if (allProperties) {
            restDeployment.id = deployment.id;// this is undefined
            restDeployment.createdTime = deployment.createdTime;// this is undefined
        }

        return restDeployment;
    }

    private releaseToPackage(storageRelease: adapter_types.CodePushRelease): sdk_types.Package {
        if (!storageRelease) {
            return null;
        }

        const restRelease: sdk_types.Package = {
            appVersion: storageRelease.target_binary_range,
            blobUrl: storageRelease.blob_url,
            isDisabled: storageRelease.is_disabled,
            isMandatory: storageRelease.is_mandatory,
            label: storageRelease.label,
            packageHash: storageRelease.package_hash,
            releasedByUserId: storageRelease.released_by,
            releaseMethod: storageRelease.release_method,
            rollout: storageRelease.rollout,
            size: storageRelease.size,
            uploadTime: storageRelease.upload_time,
            manifestBlobUrl: storageRelease.manifestBlobUrl // this is undefined
        };

        if (storageRelease.diffPackageMap) {
            restRelease.diffPackageMap = storageRelease.diffPackageMap;
        }

        if (restRelease.rollout === undefined || restRelease.rollout === null) {
            restRelease.rollout = 100;
        }

        return restRelease;
    }

    private async getUser(): Promise<adapter_types.UserProfile> {
        try {
            const res = await this._requestManager.get(`/user`);
            return res.body;
        } catch (error) {
            throw error;
        }
    }
}

export = Adapter;
