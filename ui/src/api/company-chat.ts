import { api } from "./client";

export interface ChatRequest {
  message: string;
}

export interface ChatResponse {
  issueId: string;
  identifier: string;
  coordinatorId: string;
}

export const companyChatApi = {
  send: (companyId: string, body: ChatRequest) =>
    api.post<ChatResponse>(`/companies/${companyId}/chat`, body),
};
