import { Octokit } from "@octokit/rest";
import { GetResponseDataTypeFromEndpointMethod } from "@octokit/types";
let tmpO = new Octokit();

export type GetCombinedStatusForRef = GetResponseDataTypeFromEndpointMethod<typeof tmpO.repos.getCombinedStatusForRef>;
