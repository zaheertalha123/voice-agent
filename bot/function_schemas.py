"""
Function schemas for Pipecat voice agent function calling
Defines all available tools that the LLM can invoke
"""

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema


# =============================================================================
# UTILITY FUNCTION SCHEMAS
# =============================================================================

UTILITY_FUNCTION_SCHEMAS = [
    FunctionSchema(
        name="send_email",
        description="Send an email. Use this when the user requests to send an email, send a message, or notify someone via email. The email will be sent to the configured recipient address with the subject 'Automated SDR Query'. You only need to provide the email body content based on the user's request and conversation context.",
        properties={
            "body": {
                "type": "string",
                "description": "The email body/content. Write a professional, clear message that addresses the user's request. Include all relevant details from the conversation context. Format it as plain text suitable for email.",
            },
        },
        required=["body"],
    ),
    FunctionSchema(
        name="transfer_to_human",
        description="Transfer call to human. Use ONLY for: (1) user asks for human/agent, (2) final holds/charges/invoices/payment questions.",
        properties={
            "reason": {"type": "string", "description": "Brief reason for transfer"}
        },
        required=["reason"],
    ),
    FunctionSchema(
        name="submit_call_analysis",
        description="Submit structured analysis of the call. Call this before end_call to record what happened during the conversation (interest level, objections, pain points, etc.). Use only after analyzing the entire conversation.",
        properties={
            "interest_level": {
                "type": "string",
                "enum": ["high", "medium", "low", "none"],
                "description": "Overall prospect qualification level"
            },
            "want_demo": {
                "type": "boolean",
                "description": "Whether prospect expressed interest in a demo or 2-min overview"
            },
            "transferred_to_human": {
                "type": "boolean",
                "description": "Whether transfer_to_human function was called"
            },
            "demo_booked": {
                "type": "boolean",
                "description": "Whether a demo or follow-up was confirmed"
            },
            "qualified_lead": {
                "type": "boolean",
                "description": "Whether prospect met basic qualifying criteria (decision-maker, pain points, etc.)"
            },
            "objections": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "description": "Objection type (e.g., 'not_interested', 'budget', 'already_have')"},
                        "quote": {"type": "string", "description": "Relevant quote from the prospect"},
                        "handled": {"type": "boolean", "description": "Whether objection was addressed"}
                    }
                },
                "description": "Key objections raised during the call"
            },
            "pain_points_mentioned": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Pain points the prospect mentioned (e.g., 'high call volume', 'staff shortages')"
            },
            "company_size_category": {
                "type": "string",
                "enum": ["small", "medium", "large"],
                "description": "Company size category (if determined)"
            },
            "call_sentiment": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Overall call sentiment score (0=very negative, 100=very positive)"
            },
            "customer_satisfaction_estimate": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Estimated prospect satisfaction (0=very dissatisfied, 100=very satisfied)"
            },
            "pitch_delivery_score": {
                "type": "integer",
                "minimum": 0,
                "maximum": 100,
                "description": "Self-assessment of pitch delivery quality (clarity, conciseness, naturalness)"
            },
            "extracted_info": {
                "type": "object",
                "properties": {
                    "decision_maker": {"type": "boolean"},
                    "current_provider": {"type": "string"},
                    "monthly_inquiries": {"type": "integer"}
                },
                "description": "Extracted entities from conversation"
            }
        },
        required=["interest_level", "qualified_lead", "call_sentiment", "pitch_delivery_score"],
    ),
    FunctionSchema(
        name="end_call",
        description="End the call gracefully. Use this when the user says goodbye, indicates they're done, or wants to hang up. Examples: 'bye', 'goodbye', 'that's all', 'I'm done', 'thanks bye', 'have a good day', 'talk to you later', 'gotta go', 'end call', 'hang up'.",
        properties={
            "farewell_message": {
                "type": "string",
                "description": "A brief, friendly farewell message to say before ending the call (e.g., 'Goodbye! Have a great day.')",
            }
        },
        required=["farewell_message"],
    ),
]


# Combine all schemas
FUNCTION_SCHEMAS = UTILITY_FUNCTION_SCHEMAS

# Create tools schema with all function schemas
TOOLS = ToolsSchema(standard_tools=FUNCTION_SCHEMAS)
