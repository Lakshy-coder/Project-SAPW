from transformers import AutoTokenizer, AutoModelForCausalLM

MODEL_PATH = r"C:\Users\ranal\Qwen3-4B"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(
    MODEL_PATH,
    local_files_only=True
)

print("Loading Qwen3-4B...")
model = AutoModelForCausalLM.from_pretrained(
    MODEL_PATH,
    local_files_only=True,
    torch_dtype="auto",
    device_map="auto"
)

print("Model loaded successfully!")

messages = [
    {
        "role": "user",
        "content": "Explain artificial intelligence in 3 simple points."
    }
]

prompt = tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=True
)

inputs = tokenizer(prompt, return_tensors="pt")

print("\nGenerating response...\n")

outputs = model.generate(
    **inputs,
    max_new_tokens=200
)

response = tokenizer.decode(
    outputs[0][inputs["input_ids"].shape[1]:],
    skip_special_tokens=True
)

print(response)