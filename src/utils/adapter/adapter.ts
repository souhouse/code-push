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

    public toApigatewayAppCreationRequest(appToCreate: sdk_types.AppCreationRequest): adapter_types.ApigatewayAppCreationRequest {
        if (
            appToCreate.os !== 'iOS' &&
            appToCreate.os !== 'Android' &&
            appToCreate.os !== 'Windows' &&
            appToCreate.os !== 'Linux'
        ) {
            throw this.getCodePushError(`The app OS "${appToCreate.os}" isn't valid. It should be "iOS", "Android", "Windows" or "Linux".`, RequestManager.ERROR_CONFLICT);
        }

        if (
            appToCreate.platform !== 'React-Native' &&
            appToCreate.platform !== 'Cordova' &&
            appToCreate.platform !== 'Electron'
        ) {
            throw this.getCodePushError(`The app platform "${appToCreate.platform}" isn't valid. It should be "React-Native", "Cordova" or "Electron".`, RequestManager.ERROR_CONFLICT);
        }

        const org: string = this.getOrgFromLegacyAppRequest(appToCreate);
        const appcenterClientApp: adapter_types.App = this.toAppcenterClientApp(appToCreate);

        if (!this.isValidAppCenterAppName(appcenterClientApp.display_name)) {
            throw this.getCodePushError(`The app name "${appcenterClientApp.display_name}" isn't valid. It can only contain alphanumeric characters, dashes, periods, or underscores.`, RequestManager.ERROR_CONFLICT);
        }

        return { org, appcenterClientApp };
    }

    public async addStandardDeployments(apiAppName: string): Promise<void> {
        const { appOwner, appName } = await this.parseApiAppName(apiAppName);
        const deploymentsToCreate = ['Staging', 'Production'];
        await Promise.all(
            deploymentsToCreate.map(async (deploymentName) => {
                const deployment = <sdk_types.Deployment>{ name: deploymentName };
                return await this._requestManager.post(`/apps/${appOwner}/${appName}/deployments/`, JSON.stringify(deployment), /*expectResponseBody=*/ true);
            })
        );

        return;
    };

    public async getRenamedApp(newName: string, appOwner: string, oldName: string): Promise<adapter_types.UpdatedApp> {
        const app = await this.getApp(appOwner, oldName);

        if (newName.indexOf('/') !== -1) {
            throw this.getCodePushError(`The new app name "${newName}" must be unqualified, not having a '/' character.`, RequestManager.ERROR_CONFLICT);
        }

        if (!this.isValidAppCenterAppName(newName)) {
            throw this.getCodePushError(`The app name "${newName}" isn't valid. It can only contain alphanumeric characters, dashes, periods, or underscores.`, RequestManager.ERROR_CONFLICT);
        }

        // If the display name was set on the existing app, then it was different than the app name. In that case, leave the display name unchanged;
        // the user can change the display name through the Mobile Center web portal if they want to rename it.
        // But if the display name and app name were the same, then rename them both.
        const updatedApp =
            app.name === app.display_name
                ? {
                    name: newName,
                    display_name: newName
                }
                : { name: newName };

        return updatedApp;
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

    public toLegacyDeploymentHistory(releases: adapter_types.CodePushRelease[]): sdk_types.Package[] {
        return releases.map((release) => this.releaseToPackage(release));
    }

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

    private releaseToPackage(apiGatewayRelease: adapter_types.CodePushRelease): sdk_types.Package {
        if (!apiGatewayRelease) {
            return null;
        }

        const restRelease: sdk_types.Package = {
            appVersion: apiGatewayRelease.target_binary_range,
            blobUrl: apiGatewayRelease.blob_url,
            isDisabled: apiGatewayRelease.is_disabled,
            isMandatory: apiGatewayRelease.is_mandatory,
            label: apiGatewayRelease.label,
            packageHash: apiGatewayRelease.package_hash,
            releasedByUserId: apiGatewayRelease.released_by,
            releaseMethod: apiGatewayRelease.release_method,
            rollout: apiGatewayRelease.rollout,
            size: apiGatewayRelease.size,
            uploadTime: apiGatewayRelease.upload_time
        };

        if (apiGatewayRelease.diff_package_map) {
            restRelease.diffPackageMap = apiGatewayRelease.diff_package_map;
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

    private async getApp(appOwner: string, appName: string): Promise<adapter_types.App> {
        try {
            const res = await this._requestManager.get(`/apps/${appOwner}/${appName}`);
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

    private getOrgFromLegacyAppRequest(legacyCreateAppRequest: sdk_types.AppCreationRequest) {
        const slashIndex = legacyCreateAppRequest.name.indexOf('/');
        const org = slashIndex !== -1 ? legacyCreateAppRequest.name.substring(0, slashIndex) : null;

        return org;
    }

    private toAppcenterClientApp(legacyCreateAppRequest: sdk_types.AppCreationRequest): adapter_types.App {
        // If the app name contains a slash, then assume that the app is intended to be owned by an org, with the org name
        // before the slash. Update the app info accordingly.
        const slashIndex = legacyCreateAppRequest.name.indexOf('/');

        return {
            os: legacyCreateAppRequest.os as adapter_types.AppOs,
            platform: legacyCreateAppRequest.platform as adapter_types.AppPlatform,
            display_name:
                slashIndex !== -1 ? legacyCreateAppRequest.name.substring(slashIndex + 1) : legacyCreateAppRequest.name
        };
    }

    private isValidAppCenterAppName(name: any): boolean {
        return this.getStringValidator(/*maxLength=*/ 1000, /*minLength=*/ 1)(name) && /^[a-zA-Z0-9-._]+$/.test(name); // Only allow alphanumeric characters, dashes, periods, or underscores
    }

    private getStringValidator(maxLength: number = 1000, minLength: number = 0): (value: any) => boolean {
        return function isValidString(value: string): boolean {
            if (typeof value !== 'string') {
                return false;
            }

            if (maxLength > 0 && value.length > maxLength) {
                return false;
            }

            return value.length >= minLength;
        };
    }

    private getCodePushError(message: string, errorCode: number): sdk_types.CodePushError {
        return {
            message: message,
            statusCode: errorCode
        };
    }
}

export = Adapter;
