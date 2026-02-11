# AI Chat Component Architecture

The AI Chat component system provides a fully-featured, reusable chat interface that can be easily integrated into any part of the application. This document outlines the component structure and interactions to help AI assistants better understand the system design.

## Component Structure

- `chat-window.vue`: The main container component that orchestrates all chat functionality
- `chat-content.vue`: Renders the message history area and chat welcome information
- `chat-message.vue`: Renders individual chat messages with proper formatting
- `chat-input.vue`: Handles user input, file uploads, and sending messages
- `chat-welcome.vue`: Displays welcome information for knowledge bases
- `chat-history-sidebar.vue`: Provides a narrow sidebar with new chat and message history functionality
- `knowleges.vue`: Displays the list of available knowledge bases
- `mcps.vue`: Manages model capabilities and parameters selection
- Supporting dialogs:
  - `prompts.vue`: Dialog for selecting prompt templates
  - `functions.vue`: Dialog for selecting available functions
  - `tables.vue`: Dialog for selecting database tables
  - `widgets/audio.vue`: Dialog for audio-related functionality
  - `widgets/audio-player.vue`: Component for playing audio responses
  - `widgets/modelList.vue`: Component for model selection

## Key Features

- Complete chat UI with message history, input area, and controls
- Support for different AI models based on chat type (Chat, Image, Reason)
- Model selection capabilities with customizable parameters
- Model capabilities and parameters configuration (MCPS)
- SSE connections for real-time message streaming
- Multiple message types (text, files, images, etc.)
- Local storage for conversation persistence
- Deep reasoning mode with thought process display
- Knowledge base integration with reference materials
- File and image upload functionality
- Audio input and output capabilities
- Direct chat mode with history sidebar when accessed via URL parameters

## State Management

The chat component maintains several key state variables:

- `messageList`: Array of chat messages (both user and AI)
- `selectedKnowledge`: The current knowledge base being used
- `isFinish`: Whether the AI is currently generating a response
- `isReasoningMode`: Whether deep reasoning mode is enabled
- `uploadedFiles`/`uploadedImages`: Files/images attached to the current message
- `isDirectChat`: Whether the interface is in direct chat mode (accessed via URL)

## Data Flow

1. User inputs a message via `chat-input.vue`
2. The message is processed by `chat-window.vue` which initiates an SSE connection
3. Response chunks stream in and update the latest message in `messageList`
4. `chat-content.vue` displays messages and handles scrolling
5. `chat-message.vue` renders each message with appropriate UI elements

## Knowledge Base Integration

The component can connect to different knowledge bases:

- Regular chat modes use standard knowledge bases
- Special modes like image generation (-3) or reasoning mode (-7) use dedicated models
- Knowledge bases can provide welcome messages, suggested prompts, and reference materials

## Direct Chat Mode

When the component is accessed via URL with a datasetId parameter:

1. The main `index.vue` sets `isDirectChat` to true
2. The knowledge base sidebar is hidden
3. A compact `chat-history-sidebar.vue` is shown instead
4. Users can start new chats or access recent message history

## Exposed Methods

The main component exposes several methods for external control:

- `sendChatMessage`: Send a new message
- `clearStoreMessageList`: Clear the conversation history
- `regenerateText`: Regenerate the last response
- `stopGenerateText`: Stop the current generation
- `scrollToBottom`: Scroll the chat window
- `setMessageContent`: Set the input content
- `getMessages`: Get the current message list
- `getSelectedKnowledge`: Get the current knowledge base

## Usage Example

```vue
<template>
	<chat-window
		ref="chatWindowRef"
		knowledge-id="0"
		:show-clear-button="true"
		:show-model-list="true"
		initial-message="Hello, AI assistant!"
		@chat-start="onChatStart"
		@chat-end="onChatEnd"
		@response-received="onResponseReceived"
		@chat-cleared="onChatCleared"
		@knowledge-selected="onKnowledgeSelected"
	/>
</template>

<script setup>
import { ref } from 'vue';
import ChatWindow from './components/chat-window.vue';

const chatWindowRef = ref();

// Event handlers
const onChatStart = () => {
	console.log('Chat started');
};

const onChatEnd = (result) => {
	console.log('Chat ended', result);
};

const onResponseReceived = (data) => {
	// Handle response data if needed
};

const onChatCleared = () => {
	console.log('Chat cleared');
};

const onKnowledgeSelected = (knowledge) => {
	console.log('Knowledge selected', knowledge);
};
</script>
```

## Direct Chat Mode Example

To access the chat in direct mode, use a URL with query parameters:

```
/knowledge/aiChat?datasetId=-3
```

This will:

1. Load the specified dataset (e.g., `-3` for image generation)
2. Hide the knowledge base sidebar
3. Show the chat history sidebar with recent messages and new chat button
4. Focus the interface on the chat window

## Technical Implementation Details

- Uses Vue 3 Composition API with TypeScript
- Manages SSE connections via `useEventSource` from VueUse
- Implements markdown rendering for rich message display
- Uses TailwindCSS with DaisyUI for styling
- Integrates with Element Plus for UI components
- Persists conversations in local storage
- Implements file conversion to base64 for attachments
- Supports different rendering modes (standard, mind map) based on knowledge type
