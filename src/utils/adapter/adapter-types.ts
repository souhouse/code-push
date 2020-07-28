export type AppMemberPermissions = 'manager' | 'developer' | 'viewer' | 'tester';

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
