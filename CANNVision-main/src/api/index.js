import { addApiDefinition } from './add';
import { addsApiDefinition } from './adds';
import { shiftLeftApiDefinition } from './shiftleft';
import { shiftRightApiDefinition } from './shiftright';
import { compareApiDefinition } from './compare';
import { add3ApiDefinition } from './add3';
import { axpyApiDefinition } from './axpy';
import { datacopyApiDefinition } from './datacopy';
import { mulApiDefinition } from './mul';
import { duplicateApiDefinition } from './duplicate';
import { scatterApiDefinition } from './scatter';
import { gatherApiDefinition } from './gather';
import { WholeReduceMaxApiDefinition } from './wholereducemax';
import { selectApiDefinition } from './select';
import { BlockReduceMaxApiDefinition } from './blockreducemax';
import { proposalConcatApiDefinition } from './proposalconcat.js';
import { reducemaxApiDefinition } from './reducemax.js';

export {
  apiNodeDefinitionPresets,
  buildApiParameterValues,
  defaultApiParameterDefinitions,
  unaryApiNodeDefinitions,
  binaryApiNodeDefinitions,
  ternaryApiNodeDefinitions,
} from './memstates';

const apiDefinitions = [
  datacopyApiDefinition,
  addApiDefinition,
  addsApiDefinition,
  shiftLeftApiDefinition,
  shiftRightApiDefinition,
  compareApiDefinition,
  add3ApiDefinition,
  axpyApiDefinition,
  mulApiDefinition,
  duplicateApiDefinition,
  scatterApiDefinition,
  gatherApiDefinition,
  WholeReduceMaxApiDefinition,
  selectApiDefinition,
  BlockReduceMaxApiDefinition,
  proposalConcatApiDefinition,
  reducemaxApiDefinition,
];

const apiDefinitionMap = Object.fromEntries(
  apiDefinitions.map((definition) => [definition.id, definition])
);

export const apiOperationItems = apiDefinitions.map(({ id, label }) => ({
  id,
  label,
}));

export const getApiOperationDefinition = (operationId) =>
  apiDefinitionMap[operationId] ?? addApiDefinition;
