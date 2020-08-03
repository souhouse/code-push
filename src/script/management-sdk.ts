import * as fs from "fs";
import * as path from "path";
import slash = require("slash");
import * as recursiveFs from "recursive-fs";
import * as yazl from "yazl";
import Adapter from "../utils/adapter/adapter"
import RequestManager from "../utils/request-manager"
import { CodePushUnauthorizedError } from "../utils/code-push-error"
import FileUploadClient, { IProgress } from "appcenter-file-upload-client";

import { AccessKey, AccessKeyRequest, Account, App, AppCreationRequest, CollaboratorMap, CollaboratorProperties, Deployment, DeploymentMetrics, Headers, Package, PackageInfo, ServerAccessKey, Session, UpdateMetrics, ReleaseUploadAssets, UploadReleaseProperties, CodePushError } from "./types";

interface JsonResponse {
    headers: Headers;
    body?: any;
}

interface PackageFile {
    isTemporary: boolean;
    path: string;
}

// A template string tag function that URL encodes the substituted values
function urlEncode(strings: TemplateStringsArray, ...values: string[]): string {
    var result = "";
    for (var i = 0; i < strings.length; i++) {
        result += strings[i];
        if (i < values.length) {
            result += encodeURIComponent(values[i]);
        }
    }

    return result;
}

class AccountManager {
    public static AppPermission = {
        OWNER: "Owner",
        COLLABORATOR: "Collaborator"
    };

    private _accessKey: string;
    private _requestManager: RequestManager;
    private _adapter: Adapter;
    private _serverUrl: string;
    private _customHeaders: Headers;
    private _proxy: string;
    private _fileUploadClient: FileUploadClient;

    constructor(accessKey: string, customHeaders?: Headers, serverUrl?: string, proxy?: string) {
        if (!accessKey) throw new CodePushUnauthorizedError("A token must be specified.");

        this._accessKey = accessKey;
        this._requestManager = new RequestManager(accessKey, customHeaders, serverUrl, proxy);
        this._adapter = new Adapter(this._requestManager);
        this._customHeaders = customHeaders;
        this._serverUrl = serverUrl;
        this._proxy = proxy;
        this._fileUploadClient = new FileUploadClient();
    }

    public get accessKey(): string {
        return this._accessKey;
    }

    public async isAuthenticated(throwIfUnauthorized?: boolean): Promise<boolean> {
        const res: JsonResponse = await this._requestManager.get(urlEncode`/user`, false, throwIfUnauthorized);
        const authenticated: boolean = !!res.body;

        return authenticated;
    }

    public async addAccessKey(friendlyName: string, ttl?: number): Promise<AccessKey> {
        if (!friendlyName) {
            throw new CodePushUnauthorizedError("A name must be specified when adding an access key.");
        }

        const accessKeyRequest: AccessKeyRequest = {
            description: friendlyName
        };

        const res: JsonResponse = await this._requestManager.post(urlEncode`/api_tokens`, JSON.stringify(accessKeyRequest), /*expectResponseBody=*/ true);
        const accessKey = this._adapter.toLegacyAccessKey(res.body);
        return accessKey;
    }

    // Deprecated
    public getAccessKey(accessKeyName: string): CodePushError {
        throw {
            message: 'Method is deprecated',
            statusCode: 404
        }
    }

    public async getAccessKeys(): Promise<AccessKey[]> {
        const res: JsonResponse = await this._requestManager.get(urlEncode`/api_tokens`);
        const accessKeys = this._adapter.toLegacyAccessKeyList(res.body);
        return accessKeys;
    }

    // Deprecated
    public getSessions(): CodePushError {
        throw {
            message: 'Method is deprecated',
            statusCode: 404
        }
    }

    // Deprecated
    public patchAccessKey(oldName: string, newName?: string, ttl?: number): CodePushError {
        throw {
            message: 'Method is deprecated',
            statusCode: 404
        }
    }

    public async removeAccessKey(name: string): Promise<void> {
        await this._requestManager.del(urlEncode`/accessKeys/${name}`);
        return null;
    }

    // Deprecated
    public removeSession(machineName: string): CodePushError {
        throw {
            message: 'Method is deprecated',
            statusCode: 404
        }
    }

    // Account
    public async getAccountInfo(): Promise<Account> {
        const res: JsonResponse = await this._requestManager.get(urlEncode`/user`);
        const accountInfo = this._adapter.toLegacyAccount(res.body);
        return accountInfo;
    }

    // Apps
    public async getApps(): Promise<App[]> {
        const res: JsonResponse = await this._requestManager.get(urlEncode`/apps`);
        const apps = await this._adapter.toLegacyApps(res.body);
        return apps;
    }

    public async getApp(apiAppName: string): Promise<App> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const res: JsonResponse = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}`);
        const app = await this._adapter.toLegacyApp(res.body);
        return app;
    }

    public async addApp(appName: string, appOs: string, appPlatform: string, manuallyProvisionDeployments: boolean = false): Promise<App> {
        var app: AppCreationRequest = {
            name: appName,
            os: appOs,
            platform: appPlatform,
            manuallyProvisionDeployments: manuallyProvisionDeployments
        };

        const apigatewayAppCreationRequest = this._adapter.toApigatewayAppCreationRequest(app);

        const path = apigatewayAppCreationRequest.org ? `/orgs/${apigatewayAppCreationRequest.org}/apps` : `/apps`;
        await this._requestManager.post(path, JSON.stringify(apigatewayAppCreationRequest.appcenterClientApp), /*expectResponseBody=*/ false);

        if (!manuallyProvisionDeployments) {
            await this._adapter.addStandardDeployments(appName);
        }
        return app;
    }

    public async removeApp(apiAppName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        await this._requestManager.del(urlEncode`/apps/${appOwner}/${appName}`);
        return null;
    }

    public async renameApp(oldAppName: string, newAppName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(oldAppName);
        const updatedApp = await this._adapter.getRenamedApp(newAppName, appOwner, appName);

        await this._requestManager.patch(urlEncode`/apps/${appOwner}/${appName}`, JSON.stringify(updatedApp));
        return null;
    }

    public async transferApp(apiAppName: string, orgName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);

        await this._requestManager.post(urlEncode`/apps/${appOwner}/${appName}/transfer/${orgName}`, /*requestBody=*/ null, /*expectResponseBody=*/ false);
        return null;
    }

    // Collaborators
    public async getCollaborators(apiAppName: string): Promise<CollaboratorMap> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);

        const res: JsonResponse = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}/users`);
        const collaborators = await this._adapter.toLegacyCollaborators(res.body, appOwner);
        return collaborators;
    }

    public async addCollaborator(apiAppName: string, email: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const userEmailRequest = {
            user_email: email
        };
        await this._requestManager.post(urlEncode`/apps/${appOwner}/${appName}/invitations`, JSON.stringify(userEmailRequest), /*expectResponseBody=*/ false);
        return null;
    }

    public async removeCollaborator(apiAppName: string, email: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);

        await this._requestManager.del(urlEncode`/apps/${appOwner}/${appName}/invitations/${email}`);
        return null;
    }

    // Deployments
    public async addDeployment(apiAppName: string, deploymentName: string): Promise<Deployment> {
        const deployment = <Deployment>{ name: deploymentName };
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const res = await this._requestManager.post(urlEncode`/apps/${appOwner}/${appName}/deployments/`, JSON.stringify(deployment), /*expectResponseBody=*/ true);

        return this._adapter.toLegacyDeployment(res.body);
    }

    public async clearDeploymentHistory(apiAppName: string, deploymentName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        await this._requestManager.del(urlEncode`/apps/${appOwner}/${appName}/deployments/${deploymentName}/releases`);

        return null;
    }

    public async getDeployments(apiAppName: string): Promise<Deployment[]> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const res: JsonResponse = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}/deployments/`);

        return this._adapter.toLegacyDeployments(res.body);
    }

    public async getDeployment(apiAppName: string, deploymentName: string): Promise<Deployment> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const res: JsonResponse = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}/deployments/${deploymentName}`);

        return this._adapter.toLegacyDeployment(res.body);
    }

    public async renameDeployment(apiAppName: string, oldDeploymentName: string, newDeploymentName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        await this._requestManager.patch(urlEncode`/apps/${appOwner}/${appName}/deployments/${oldDeploymentName}`, JSON.stringify({ name: newDeploymentName }));

        return null;
    }

    public async removeDeployment(apiAppName: string, deploymentName: string): Promise<void> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        await this._requestManager.del(urlEncode`/apps/${appOwner}/${appName}/deployments/${deploymentName}`);

        return null;
    }

    public async getDeploymentMetrics(apiAppName: string, deploymentName: string): Promise<DeploymentMetrics> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);

        const res = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}/deployments/${deploymentName}/metrics`);
        const deploymentMetrics = this._adapter.toLegacyDeploymentMetrics(res.body);
        return deploymentMetrics;
    }

    public async getDeploymentHistory(apiAppName: string, deploymentName: string): Promise<Package[]> {
        const { appOwner, appName } = await this._adapter.parseApiAppName(apiAppName);
        const res = await this._requestManager.get(urlEncode`/apps/${appOwner}/${appName}/deployments/${deploymentName}/releases`);

        return this._adapter.toLegacyDeploymentHistory(res.body);
    }

    public async release(appName: string, deploymentName: string, filePath: string, targetBinaryVersion: string, updateMetadata: PackageInfo, uploadProgressCallback?: (progress: number) => void): Promise<Package> {
        updateMetadata.appVersion = targetBinaryVersion;
        const packageFile: PackageFile = await this.packageFileFromPath(filePath);
        const userName = (await this.getAccountInfo()).name;

        const assetJsonResponse: JsonResponse = await this._requestManager.post(urlEncode`/apps/${userName}/${appName}/deployments/${deploymentName}/uploads`, null, true)
        const assets = assetJsonResponse.body as ReleaseUploadAssets;

        await this._fileUploadClient.upload({
            assetId: assets.id,
            assetDomain: assets.upload_domain,
            assetToken: assets.token,
            file: packageFile.path,
            onProgressChanged: (progressData: IProgress) => {
                if (uploadProgressCallback) {
                    uploadProgressCallback(progressData.percentCompleted);
                }
            },
        });

        const releaseUploadProperties: UploadReleaseProperties = this._adapter.toReleaseUploadProperties(updateMetadata, assets, deploymentName);
        const releaseJsonResponse: JsonResponse = await this._requestManager.post(urlEncode`/apps/${userName}/${appName}/deployments/${deploymentName}/releases`, JSON.stringify(releaseUploadProperties), true);
        const releasePackage: Package = this._adapter.toLegacyPackage(releaseJsonResponse.body);

        return releasePackage;
    }

    public patchRelease(appName: string, deploymentName: string, label: string, updateMetadata: PackageInfo): Promise<void> {
        updateMetadata.label = label;
        var requestBody: string = JSON.stringify({ packageInfo: updateMetadata });
        return this._requestManager.patch(urlEncode`/apps/${this.appNameParam(appName)}/deployments/${deploymentName}/release`, requestBody, /*expectResponseBody=*/ false)
            .then(() => null);
    }

    public promote(appName: string, sourceDeploymentName: string, destinationDeploymentName: string, updateMetadata: PackageInfo): Promise<Package> {
        var requestBody: string = JSON.stringify({ packageInfo: updateMetadata });
        return this._requestManager.post(urlEncode`/apps/${this.appNameParam(appName)}/deployments/${sourceDeploymentName}/promote/${destinationDeploymentName}`, requestBody, /*expectResponseBody=*/ true)
            .then((res: JsonResponse) => res.body.package);
    }

    public rollback(appName: string, deploymentName: string, targetRelease?: string): Promise<void> {
        return this._requestManager.post(urlEncode`/apps/${this.appNameParam(appName)}/deployments/${deploymentName}/rollback/${targetRelease || ``}`, /*requestBody=*/ null, /*expectResponseBody=*/ false)
            .then(() => null);
    }

    private packageFileFromPath(filePath: string): Promise<PackageFile> {
        var getPackageFilePromise: Promise<PackageFile>;
        if (fs.lstatSync(filePath).isDirectory()) {
            getPackageFilePromise = new Promise<PackageFile>((resolve: (file: PackageFile) => void, reject: (reason: Error) => void): void => {
                var directoryPath: string = filePath;

                recursiveFs.readdirr(directoryPath, (error?: any, directories?: string[], files?: string[]): void => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    var baseDirectoryPath = path.dirname(directoryPath);
                    var fileName: string = this.generateRandomFilename(15) + ".zip";
                    var zipFile = new yazl.ZipFile();
                    var writeStream: fs.WriteStream = fs.createWriteStream(fileName);

                    zipFile.outputStream.pipe(writeStream)
                        .on("error", (error: Error): void => {
                            reject(error);
                        })
                        .on("close", (): void => {
                            filePath = path.join(process.cwd(), fileName);

                            resolve({ isTemporary: true, path: filePath });
                        });

                    for (var i = 0; i < files.length; ++i) {
                        var file: string = files[i];
                        var relativePath: string = path.relative(baseDirectoryPath, file);

                        // yazl does not like backslash (\) in the metadata path.
                        relativePath = slash(relativePath);

                        zipFile.addFile(file, relativePath);
                    }

                    zipFile.end();
                });
            });
        } else {
            getPackageFilePromise = new Promise<PackageFile>((resolve: (file: PackageFile) => void, reject: (reason: Error) => void): void => {
                resolve({ isTemporary: false, path: filePath });
            });
        }
        return getPackageFilePromise;
    }

    private generateRandomFilename(length: number): string {
        var filename: string = "";
        var validChar: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

        for (var i = 0; i < length; i++) {
            filename += validChar.charAt(Math.floor(Math.random() * validChar.length));
        }

        return filename;
    }

    // IIS and Azure web apps have this annoying behavior where %2F (URL encoded slashes) in the URL are URL decoded
    // BEFORE the requests reach node. That essentially means there's no good way to encode a "/" in the app name--
    // URL encoding will work when running locally but when running on Azure it gets decoded before express sees it,
    // so app names with slashes don't get routed properly. See https://github.com/tjanczuk/iisnode/issues/343 (or other sites
    // that complain about the same) for some more info. I explored some IIS config based workarounds, but the previous
    // link seems to say they won't work, so I eventually gave up on that.
    // Anyway, to workaround this issue, we now allow the client to encode / characters as ~~ (two tildes, URL encoded).
    // The CLI now converts / to ~~ if / appears in an app name, before passing that as part of the URL. This code below
    // does the encoding. It's hack, but seems like the least bad option here.
    // Eventually, this service will go away & we'll all be on Max's new service. That's hosted in docker, no more IIS,
    // so this issue should go away then.
    private appNameParam(appName: string) {
        return appName.replace("/", "~~");
    }
}

export = AccountManager;
