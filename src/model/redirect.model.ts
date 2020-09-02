export interface Redirect {

    sources?: string[];
    destinations?: string[];

    options?: {
        title?: string;
        richEmbed?: boolean;
        richEmbedColor?: number;
        removeEveryone?: boolean;
        removeHere?: boolean;
        includeSource?: boolean;
        copyRichEmbed?: boolean;
    };

}
