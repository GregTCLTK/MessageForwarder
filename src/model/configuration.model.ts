import { Redirect } from "./redirect.model";

export interface Configuration {

    token?: string;

    redirects?: Redirect[];

}
