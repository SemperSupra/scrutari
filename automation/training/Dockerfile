FROM python:3.12-slim@sha256:423ed6ab25b1921a477529254bfeeabf5855151dc2c3141699a1bfc852199fbf

LABEL description="Scrutari ML Training — reproducible pipeline"
LABEL version="1.0.0"

# Pin all dependency versions for reproducibility
RUN pip install --no-cache-dir \
    numpy==2.2.5 \
    scipy==1.15.3 \
    scikit-learn==1.9.0 \
    onnx==1.22.0 \
    skl2onnx==1.20.0 \
    joblib==1.4.2

WORKDIR /scrutari

# Copy training code and data mount points
COPY train_model.py .

# Training data: mount at /scrutari/data (store.json) and /scrutari/training_data (SapiMouse)
# Model output: mounted at /scrutari/models

ENTRYPOINT ["python", "train_model.py"]
CMD ["--train"]
