import * as actionsCore from "@actions/core"
import { RunResult } from "./enums/RunResult";
import { Inputs } from "./interfaces/Inputs";
import { Octokit } from "@octokit/rest";
import importInputs from "./fn/importInputs";
import { NOT_PRESENT, OUTPUT_NAMES } from "./constants";
import { getCurrentStatuses, statusesHasFailure, statusesHasInterrupted, statusesAllComplete, statusesAllPresent, newCurrentStatuses } from "./fn/statusFunctions";
import delay from "delay";
import { ActionsCore } from "./interfaces/ActionsCore";

export class AwaitRunner {
    private inputs: Inputs;
    private octokit: Octokit;
    private currentStatuses: CheckStatus;
    private core: ActionsCore;

    constructor(testActionsCore: ActionsCore | null = null, octokit: Octokit | null = null) {
        this.core = testActionsCore ?? actionsCore;
        this.inputs = importInputs();
        this.octokit = octokit ?? new Octokit({
            auth: this.inputs.authToken,
            userAgent: "wait-for-github-status-action",
            baseUrl: 'https://api.github.com',
            log: {
                debug: () => { },
                info: console.log,
                warn: console.warn,
                error: console.error
            },
            request: {
                agent: undefined,
                fetch: undefined,
                timeout: 0
            }
        });
        this.currentStatuses = newCurrentStatuses(this.inputs.contexts);
    }

    async run() {

        let runResult = await this.runLoop();

        let runOutput: RunOutput = {
            failedCheckNames: [],
            failedCheckStates: [],
            interruptedCheckNames: [],
            interruptedCheckStates: []
        }

        if (runResult != RunResult.success) {
            this.getRunOutput(runOutput, runResult);
        }

        this.core.setOutput(OUTPUT_NAMES.result, runResult);
        this.core.setOutput(OUTPUT_NAMES.numberOfFailedChecks, runOutput.failedCheckNames.length);
        this.core.setOutput(OUTPUT_NAMES.failedCheckStates, runOutput.failedCheckStates.join(';'));
        this.core.setOutput(OUTPUT_NAMES.failedCheckNames, runOutput.failedCheckNames.join(';'));
    }

    private getRunOutput(output:RunOutput, runResult:RunResult) {
        this.inputs.contexts.forEach(element => {
            let curStatus = this.currentStatuses[element]
            if (runResult == RunResult.failure){
              if (!this.inputs.completeStates.includes(curStatus) || curStatus == NOT_PRESENT) {
                  output.failedCheckNames.push(element);
                  output.failedCheckStates.push(curStatus);
              }
            }
            if (runResult == RunResult.interrupted){
              if (!this.inputs.completeStates.includes(curStatus) || curStatus == NOT_PRESENT) {
                  output.interruptedCheckNames.push(element);
                  output.interruptedCheckStates.push(curStatus);
              }
            }
        });
    }

    async runLoop(): Promise<RunResult> {
        let inputs = this.inputs;
        let startTime = Date.now();
        let timeout = startTime + inputs.notPresentTimeout * 1000;
        let failed: boolean = false;
        let completed: boolean = false;
        let interrupted: boolean = false;
        let allPresent: boolean = false;

        this.currentStatuses = await getCurrentStatuses(inputs, this.octokit, this.currentStatuses);

        while (timeout > Date.now()
            && !(failed = statusesHasFailure(inputs.failureStates, this.currentStatuses))
            && !(interrupted = statusesHasInterrupted(inputs.interruptedStates, this.currentStatuses))
            && !(completed = statusesAllComplete(inputs.completeStates, this.currentStatuses))
        ) {
            await delay(inputs.pollInterval * 1000);
            if (!allPresent && statusesAllPresent(this.currentStatuses)) {
                allPresent = true;
                timeout = startTime + inputs.timeout * 1000;
            }
            this.currentStatuses = await getCurrentStatuses(inputs, this.octokit, this.currentStatuses);
        }
        if ( timeout < Date.now() ){
          return RunResult.timeout;
        }
        if ( interrupted ){
          return RunResult.interrupted;
        }
        if ( failed ) {
          return RunResult.failure;
        }
        return RunResult.success;
    }
}
