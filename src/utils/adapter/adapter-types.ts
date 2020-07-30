import { PackageHashToBlobInfoMap } from "../../script/types"

export type AppOs = 'iOS' | 'Android' | 'Tizen' | 'Windows' | 'Linux' | 'Custom'; // "Custom" is used for apps migrated from CodePush (where OS is unknown)
export type AppPlatform =
    | 'Cordova'
    | 'Java'
    | 'Objective-C-Swift'
    | 'React-Native'
    | 'Unity'
    | 'UWP'
    | 'Xamarin'
    | 'Electron'
    | 'Unknown'; // "Unknown" is used for apps migrated from CodePush (where platform is unknown)
export type AppMemberPermissions = 'manager' | 'developer' | 'viewer' | 'tester';
export type AppOrigin = 'app-center' | 'codepush';

export interface UserProfile {
  /**
   * The unique id (UUID) of the user
   */
  id: string;
  /**
   * The avatar URL of the user
   */
  avatar_url: string;
  /**
   * User is required to send an old password in order to change the password.
   */
  can_change_password: boolean;
  /**
   * The full name of the user. Might for example be first and last name
   */
  display_name: string;
  /**
   * The email address of the user
   */
  email: string;
  /**
   * The unique name that is used to identify the user.
   */
  name: string;
  /**
   * The permissions the user has for the app
   */
  permissions?: AppMemberPermissions[];
}

export interface ApiToken {
  /**
   * The unique id (UUID) of the api token
   */
  id: string;
  /**
   * The api token generated will not be accessible again
   */
  api_token: string;
  /**
   * The description of the token
   */
  description: string;
  /**
   * The creation time
   */
  created_at: string;
}

export interface ApiTokensGetResponse {
  /**
   * The unique id (UUID) of the api token
   */
  id: string;
  /**
   * The description of the token
   */
  description: string;
  /**
   * The creation time
   */
  created_at: string;
}

export interface App {
  /**
   * The unique ID (UUID) of the app
   */
  id?: string;
  /**
   * A unique and secret key used to identify the app in communication with the ingestion endpoint for crash reporting and analytics
   */
  app_secret?: string;
  /**
   * The unique ID (UUID) of the Azure subscription associate with the app
   */
  azure_subscription_id?: string;
  /**
   * The description of the app
   */
  description?: string;
  /**
   * The display name of the app
   */
  display_name?: string;
  /**
   * The string representation of the URL pointing to the app's icon
   */
  icon_url?: string;
  /**
   * The name of the app used in URLs
   */
  name?: string;
  /**
   * The OS the app will be running on
   */
  os?: AppOs;
  owner?: Owner;
  /**
   * The platform of the app
   */
  platform?: AppPlatform;
  /**
   * The origin of this app can only be app-center for now
   */
  origin?: AppOrigin;
}

/**
 * The information about the app's owner
 */
interface Owner {
  /**
   * The unique id (UUID) of the owner
   */
  id: string;
  /**
   * The avatar URL of the owner
   */
  avatar_url: string;
  /**
   * The owner's display name
   */
  display_name: string;
  /**
   * The owner's email address
   */
  email: string;
  /**
   * The unique name that used to identify the owner
   */
  name: string;
  /**
   * The owner type. Can either be 'org' or 'user'
   */
  type: OwnerType;
}

type OwnerType = 'org' | 'user';

export interface Deployment {
  /*generated*/ createdTime: number;
  /*generated*/ id?: string;
  name: string;
  key: string;
  latest_release?: any;
  removedEmail?: string;
}

export interface CodePushRelease {
  releasedByUserId: string;
  manifestBlobUrl: string;
  target_binary_range: string;
  is_disabled?: boolean;
  package_hash?: string;
  released_by?: string;
  release_method?: string;
  upload_time: number;
  is_mandatory?: boolean;
  blob_url: string;
  label?: string
  rollout?: number;
  size: number;
  diff_package_map?: PackageHashToBlobInfoMap;
}
export interface apiAppParams {
  appOwner: string;
  appName: string;
}
