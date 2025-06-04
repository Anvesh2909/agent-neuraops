import { Router } from "express";
import {
    generateResponseController,
    getConversationsController,
    getConversationMessagesController,
    deleteConversationController,
    createConversationController
} from "../controllers/engineController";

const engineRouter = Router();

engineRouter.post('/generate-response', generateResponseController);
engineRouter.get('/conversations', getConversationsController);
engineRouter.get('/conversations/:conversationId', getConversationMessagesController);
engineRouter.post('/conversations', createConversationController);
engineRouter.delete('/conversations/:conversationId', deleteConversationController);

export default engineRouter;