import { cubeOperatorDefinition } from './cube';
import { flashAttnScoreOperatorDefinition } from './flash_attn_score';
import { fusionOperatorDefinition } from './fusion';
import { geluQuantOperatorDefinition } from './gelu_quant';
import { vectorOperatorDefinition } from './vector';
import { gelumulOperatorDefinition } from './gelu_mul';
import { circularPadOperatorDefinition } from './circular_pad';
import { fatreluMulOperatorDefinition } from './fatrelu_mul';
import { angle_v2OperatorDefinition } from './angle_v2';
import { isfiniteOperatorDefinition } from './is_finite';
import { diagflatndto2dOperatorDefinition } from './diag_flat_nd_to_2d';
import { flashAttnScoreGradOperatorDefinition } from './flash_attn_score_grad';
import { addLoraOperatorDefinition } from './add_lora';

const operatorDefinitions = [
  cubeOperatorDefinition,
  flashAttnScoreOperatorDefinition,
  vectorOperatorDefinition,
  fusionOperatorDefinition,
  gelumulOperatorDefinition,
  geluQuantOperatorDefinition,
  circularPadOperatorDefinition,
  fatreluMulOperatorDefinition,
  angle_v2OperatorDefinition,
  isfiniteOperatorDefinition,
  diagflatndto2dOperatorDefinition,
  flashAttnScoreGradOperatorDefinition,
  addLoraOperatorDefinition,
];

const operatorDefinitionMap = Object.fromEntries(
  operatorDefinitions.map((definition) => [definition.id, definition])
);

export const operatorProcessItems = operatorDefinitions.map(({ id, label }) => ({
  id,
  label,
}));

export const getOperatorDefinition = (operatorId) =>
  operatorDefinitionMap[operatorId] ?? vectorOperatorDefinition;
