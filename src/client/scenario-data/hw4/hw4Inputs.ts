import female from './female.json';
import male from './male.json';
import parent_child from './parent_child.json';
import person_living from './person_living.json';
import person from './person.json';
import { Relation } from '../../../souffle-run.js';

export const hw4Inputs = {
  person,
  person_living,
  parent_child,
  female,
  male,
} as Record<string, Relation>;
