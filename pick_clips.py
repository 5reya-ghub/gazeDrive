import os
from huggingface_hub import HfApi, hf_hub_download

# Hugging Face Access Token
HF_TOKEN = os.environ.get("HF_TOKEN", "your_token_here")
REPO_ID = "nexar-ai/nexar_collision_prediction"
TARGET_DIR = "my_clips"

os.makedirs(TARGET_DIR, exist_ok=True)
api = HfApi(token=HF_TOKEN)

print("Listing available clips directly from repository...")

# 1. Fetch file paths directly from the repo tree (no video decoding triggered)
all_repo_files = api.list_repo_files(repo_id=REPO_ID, repo_type="dataset")

# Filter positive hazard clips and negative control clips
positive_files = [f for f in all_repo_files if f.startswith("train/positive/") and f.endswith(".mp4")]
negative_files = [f for f in all_repo_files if f.startswith("train/negative/") and f.endswith(".mp4")]

# 2. Select 10 positive hazard clips and 2 negative control clips
selected_positives = positive_files[:10]
selected_negatives = negative_files[:2]
target_downloads = selected_positives + selected_negatives

print(f"\nFound {len(positive_files)} positive clips and {len(negative_files)} negative clips.")
print(f"Selected {len(target_downloads)} clips for GazeDrive suite:\n")

print(f"{'Filename':<15} | {'Category'}")
print("-" * 45)
for path in target_downloads:
    fname = os.path.basename(path)
    category = "Hazard (Positive)" if "positive" in path else "Control (Negative)"
    print(f"{fname:<15} | {category}")

# 3. Download the 12 files straight into my_clips/
print("\nDownloading selected 12 clips into my_clips/ ...")
for path in target_downloads:
    fname = os.path.basename(path)
    print(f"Downloading {fname}...")
    hf_hub_download(
        repo_id=REPO_ID,
        repo_type="dataset",
        filename=path,
        local_dir=TARGET_DIR,
        token=HF_TOKEN
    )

print("\nDone! All 12 clips have been downloaded to 'my_clips/'.")