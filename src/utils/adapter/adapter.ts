import * as adapter_types from "./adapter-types";
import * as sdk_types from "../../script/types";
import RequestManager from "../request-manager";
import { UserProfile } from "./adapter-types";

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

    public async toLegacyApp(app: adapter_types.App): Promise<sdk_types.App> {
        const [user, deployments] = await Promise.all([this.getUser(), this.getDeployments(app.owner.name, app.name)]);
        const deploymentsNames = deployments.map((deployment: adapter_types.Deployment) => deployment.name);
        return this.toLegacyRestApp(app, user, deploymentsNames);
    };

    public async toLegacyApps(apps: adapter_types.App[]): Promise<sdk_types.App[]> {
        const user = await this.getUser();
        const sortedApps = await Promise.all(
            apps.sort((first: adapter_types.App, second: adapter_types.App) => {
                const firstOwner = first.owner.name || '';
                const secondOwner = second.owner.name || '';

                // First sort by owner, then by app name
                if (firstOwner !== secondOwner) {
                    return firstOwner.localeCompare(secondOwner);
                } else {
                    return first.name.localeCompare(second.name);
                }
            })
        );

        const legacyApps = await Promise.all(
            sortedApps.map(async (app) => {
                const deployments: adapter_types.Deployment[] = await this.getDeployments(app.owner.name, app.name);
                const deploymentsNames = deployments.map((deployment: adapter_types.Deployment) => deployment.name);

                return this.toLegacyRestApp(app, user, deploymentsNames);
            })
        );

        return legacyApps;
    };

    private toLegacyRestApp(app: adapter_types.App, user: UserProfile, deployments: string[]): sdk_types.App {
        const isCurrentAccount: boolean = user.id === app.owner.id;
        const isNameAndDisplayNameSame: boolean = app.name === app.display_name;

        let appName: string = app.name;
        if (!isCurrentAccount) {
            appName = app.owner.name + '/' + app.name;
        }

        if (!isNameAndDisplayNameSame) {
            appName += `  (${app.display_name})`;
        }

        return {
            name: appName,
            collaborators: {
                [app.owner.name]: {
                    isCurrentAccount: user.id === app.owner.id,
                    permission: 'Owner'
                }
            },
            deployments,
            os: app.os,
            platform: app.platform
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

    private toLegacyRestDeployments(apiGatewayDeployments: adapter_types.Deployment[]): sdk_types.Deployment[] {
        const deployments: sdk_types.Deployment[] = apiGatewayDeployments.map((deployment) => {
            return this.toLegacyRestDeployment(deployment);
        });

        return deployments;
    }

    private toLegacyRestDeployment(deployment: adapter_types.Deployment): sdk_types.Deployment {
        const apiGatewayPackage = this.releaseToPackage(deployment.latest_release);

        const restDeployment: sdk_types.Deployment = {
            name: deployment.name,
            key: deployment.key,
            package: apiGatewayPackage
        };

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
            uploadTime: storageRelease.upload_time
        };

        if (storageRelease.diff_package_map) {
            restRelease.diffPackageMap = storageRelease.diff_package_map;
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

    private async getDeployments(appOwner: string, appName: string): Promise<adapter_types.Deployment[]> {
        try {
            const res = await this._requestManager.get(`/apps/${appOwner}/${appName}/deployments/`);
            return res.body;
        } catch (error) {
            throw error;
        }
    }
}

export = Adapter;
