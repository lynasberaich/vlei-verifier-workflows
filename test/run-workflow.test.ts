import path from 'path';
import { strict as assert } from 'assert';

import {
  resolveEnvironment,
  TestEnvironment,
} from '../src/utils/resolve-env.js';
import { getConfig } from '../src/utils/test-data.js';
import { WorkflowRunner } from '../src/utils/run-workflow.js';
import { loadWorkflow } from '../src/utils/test-data.js';

let env: TestEnvironment;

afterAll((done) => {
  done();
});
beforeAll((done) => {
  done();
  env = resolveEnvironment();
});

test.only('workflow', async function run() {
  const workflowsDir = '../src/workflows/';
  const workflowFile = env.workflow;
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`)
  );
  const configFileName = env.configuration;
  const dirPath = '../src/config/';
  const configFilePath = path.join(__dirname, dirPath) + configFileName;
  const configJson = await getConfig(configFilePath);
  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

test('multiple-creds-same-aid workflow', async function run() {
  const workflowsDir = '../src/workflows/';
  const workflowFile = 'multiple-creds-same-aid-test.yaml';
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`)
  );

  const dirPath = '../src/config/';
  const configFileName = 'multiple-creds-same-aid-config.json';
  const configFilePath = path.join(__dirname, dirPath) + configFileName;
  const configJson = await getConfig(configFilePath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);

test('role-filter-workflow', async function run() {
  const workflowsDir = '../src/workflows/';
  const workflowFile = 'role-filter-test.yaml';
  const workflow = loadWorkflow(
    path.join(__dirname, `${workflowsDir}${workflowFile}`)
  );

  const dirPath = '../src/config/';
  const configFileName = 'role-filter-test-config.json';
  const configFilePath = path.join(__dirname, dirPath) + configFileName;
  const configJson = await getConfig(configFilePath);

  if (workflow && configJson) {
    const wr = new WorkflowRunner(workflow, configJson);
    const workflowRunResult = await wr.runWorkflow();
    assert.equal(workflowRunResult, true);
  }
}, 3600000);
