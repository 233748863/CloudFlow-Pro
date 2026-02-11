import { Node } from '../types/node';
import { PropType } from 'vue';

export default {
  inject: ['parent'],
  props: {
    node: {
      type: Object as PropType<Node>,
      required: true
    }
  },
  data() {
    return {
      inputParams: this.node.inputParams || [],
      outputParams: this.node.outputParams || []
    }
  }
} 